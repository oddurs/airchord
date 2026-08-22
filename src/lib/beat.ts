import type { Voice } from './groove.ts'

/**
 * A backing beat: one bar, looping, with a time signature and a tempo.
 *
 * Deliberately not the song transport. `Timeline` models an arrangement — a
 * count-in, sections, an ending — and a backing beat has none of those. Passing
 * it `bars: Infinity` to make it fit would be a worse thing than this small
 * loop, which schedules a bar at a time and can be re-tempoed at any bar line.
 *
 * Positions are in quarter-note beats, so the tempo means the same thing in
 * every signature. 6/8 is three of them felt as two, which is why it and 3/4
 * differ here only in where the weight falls — as they do in the music.
 */

export interface Hit {
  beat: number
  voice: Voice
  gain: number
}

export interface Signature {
  id: string
  label: string
  beats: number
  pattern: Hit[]
  /** Every fourth bar, so a loop breathes instead of merely repeating. */
  fill: Hit[]
}

const hat = (beat: number, gain: number): Hit => ({ beat, voice: 'hat', gain })
const kick = (beat: number, gain: number): Hit => ({ beat, voice: 'kick', gain })
const snare = (beat: number, gain: number): Hit => ({ beat, voice: 'snare', gain })

/** Eighths, with the beats a little louder than what falls between them. */
const eighths = (beats: number, gain: number): Hit[] =>
  Array.from({ length: beats * 2 }, (_, i) => hat(i / 2, i % 2 === 0 ? gain : gain * 0.58))

const STRAIGHT: Hit[] = [kick(0, 1), kick(2.5, 0.85), snare(1, 0.9), snare(3, 0.9), ...eighths(4, 0.34)]

const WALTZ: Hit[] = [kick(0, 1), snare(1, 0.85), snare(2, 0.85), ...eighths(3, 0.32)]

/** Six eighths in three beats, weighted on the first and the fourth — which is
 *  the only thing that separates this from a waltz. */
const COMPOUND: Hit[] = [
  kick(0, 1),
  kick(1.5, 0.8),
  snare(1.5, 0.85),
  hat(0, 0.34),
  hat(0.5, 0.18),
  hat(1, 0.18),
  hat(1.5, 0.3),
  hat(2, 0.18),
  hat(2.5, 0.18),
]

export const SIGNATURES: Signature[] = [
  {
    id: '4/4',
    label: 'Four',
    beats: 4,
    pattern: STRAIGHT,
    fill: [...STRAIGHT.filter((h) => h.beat < 3.5), snare(3.5, 0.7), kick(3.75, 0.65)],
  },
  {
    id: '3/4',
    label: 'Three',
    beats: 3,
    pattern: WALTZ,
    fill: [...WALTZ.filter((h) => h.beat < 2.5), snare(2.5, 0.7)],
  },
  {
    id: '6/8',
    label: 'Six eight',
    beats: 3,
    pattern: COMPOUND,
    fill: [...COMPOUND.filter((h) => h.beat < 2.5), snare(2.5, 0.62), hat(2.5, 0.24)],
  },
]

export const DEFAULT_SIGNATURE = '4/4'
export const DEFAULT_BPM = 92
export const BPM_RANGE = { min: 50, max: 160 }
/** Every fourth bar. Often enough to be a shape, rarely enough not to be a hook. */
const FILL_EVERY = 4

export function signatureById(id: string): Signature {
  return SIGNATURES.find((s) => s.id === id) ?? SIGNATURES[0]
}

export function barHits(signature: Signature, bar: number): Hit[] {
  return bar % FILL_EVERY === FILL_EVERY - 1 ? signature.fill : signature.pattern
}

export interface BeatOptions {
  /** Audio time, in seconds. */
  clock: () => number
  play: (voice: Voice, time: number, gain: number) => void
  lookaheadSec?: number
  tickMs?: number
}

/** A bar at a time is enough: it is always shorter than the lookahead needs to
 *  be long, and it means a tempo change lands on the next bar line rather than
 *  in the middle of a pattern. */
const LOOKAHEAD_SEC = 0.15
const TICK_MS = 25
const LEAD_IN_SEC = 0.08

export class BeatBox {
  private readonly options: BeatOptions
  private signature: Signature = signatureById(DEFAULT_SIGNATURE)
  private bpm = DEFAULT_BPM
  private origin = 0
  private nextBar = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(options: BeatOptions) {
    this.options = options
  }

  get running(): boolean {
    return this.timer !== null
  }

  private get barSeconds(): number {
    return (60 / this.bpm) * this.signature.beats
  }

  private timeOfBar(bar: number): number {
    return this.origin + bar * this.barSeconds
  }

  start(signature: Signature, bpm: number): void {
    this.stop()
    this.signature = signature
    this.bpm = bpm
    this.origin = this.options.clock() + LEAD_IN_SEC
    this.nextBar = 0
    this.timer = setInterval(() => this.tick(), this.options.tickMs ?? TICK_MS)
    this.tick()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Applies a change and re-anchors, so the next bar still begins when it was
   * going to and only the bars after it change spacing. Changing tempo should
   * never move the beat you are already hearing.
   */
  private atNextBar(change: () => void): void {
    const boundary = this.timeOfBar(this.nextBar)
    change()
    this.origin = boundary - this.nextBar * this.barSeconds
  }

  setBpm(bpm: number): void {
    if (bpm !== this.bpm) this.atNextBar(() => (this.bpm = bpm))
  }

  setSignature(signature: Signature): void {
    if (signature.id !== this.signature.id) this.atNextBar(() => (this.signature = signature))
  }

  /** Schedules whole bars as they come into view. Idempotent per bar. */
  tick(): void {
    const horizon = this.options.clock() + (this.options.lookaheadSec ?? LOOKAHEAD_SEC)
    while (this.timeOfBar(this.nextBar) < horizon) {
      const bar = this.nextBar++
      const at = this.timeOfBar(bar)
      const seconds = 60 / this.bpm
      for (const hit of barHits(this.signature, bar)) {
        this.options.play(hit.voice, at + hit.beat * seconds, hit.gain)
      }
    }
  }
}
