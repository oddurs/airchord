/**
 * A boolean that remembers. Crossing `on` latches true, crossing `off` latches
 * false, and everything between holds the previous answer — so a measurement
 * sitting on a threshold stops producing a new decision every frame.
 *
 * Fields are declared explicitly rather than as constructor parameter
 * properties: this module is loaded directly by the test runner, which strips
 * types rather than compiling them.
 */
export class Latch {
  private readonly on: number
  private readonly off: number
  private state: boolean

  constructor(on: number, off: number, initial = false) {
    this.on = on
    this.off = off
    this.state = initial
  }

  update(value: number): boolean {
    if (value >= this.on) this.state = true
    else if (value <= this.off) this.state = false
    return this.state
  }
}

/**
 * Exponential moving average. Higher alpha follows the hand more closely; lower
 * alpha is steadier but laggier, and lag on an instrument is felt immediately.
 */
export class Smoothed {
  private readonly alpha: number
  private value: number | null = null

  constructor(alpha: number) {
    this.alpha = alpha
  }

  update(next: number): number {
    this.value = this.value === null ? next : this.value + (next - this.value) * this.alpha
    return this.value
  }
}

/**
 * Commits a value only once it has been asked for continuously for `holdMs`.
 * Confidence and latency are the same dial: a chord change wants certainty, a
 * change of colour on a chord already sounding does not, so they get their own
 * committers rather than sharing one inherited constant.
 */
export class Committer<T> {
  private readonly holdMs: number
  private candidate: string | null = null
  private since = 0
  private value: T | null = null

  constructor(holdMs: number) {
    this.holdMs = holdMs
  }

  /**
   * `hold` overrides the default for this frame. Confidence can be bought more
   * cheaply when something else already expects this answer — a song knows what
   * chord is coming, and a chord that was predicted needs less proving than one
   * that was not. It is still the player's own pose either way.
   */
  update(next: T | null, key: string | null, now: number, hold = this.holdMs): T | null {
    if (key !== this.candidate) {
      this.candidate = key
      this.since = now
    }
    if (now - this.since >= hold) this.value = next
    return this.value
  }

  /**
   * Keeps whatever is committed without advancing the clock or accepting a new
   * candidate. Sustaining through a dropped tracking frame and authorising a
   * change are different acts: conflating them let a stale hand commit a chord
   * that was never played.
   */
  hold(): T | null {
    return this.value
  }

  /** Drops the committed value immediately, without waiting out a hold. */
  release(): void {
    this.value = null
    this.candidate = null
  }

  get current(): T | null {
    return this.value
  }
}

/**
 * Holds the last real value through a brief absence. Hand tracking drops frames,
 * and without this every dropout is an audible hole. Distinct from a rest: an
 * absent hand is an accident, a lowered hand is an instruction.
 */
export class Grace<T> {
  private readonly windowMs: number
  private value: T | null = null
  private seen = Number.NEGATIVE_INFINITY

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  update(next: T | null, now: number): T | null {
    if (next !== null) {
      this.value = next
      this.seen = now
      return next
    }
    if (now - this.seen < this.windowMs) return this.value
    this.value = null
    return null
  }
}
