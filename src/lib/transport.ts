/**
 * The clock. Beats are scheduled ahead on the audio context's own timeline —
 * `setInterval` only decides *when to look*, never when a sound happens. A
 * drum machine driven by timers or by `requestAnimationFrame` drifts audibly
 * within a few bars, and a metronome that drifts is worse than none.
 */

export interface Beat {
  /** Beats since the transport started, count-in included. */
  index: number
  /** Bar of the song, or -1 during the count-in. */
  bar: number
  /** Beat within the bar, from 0. */
  beat: number
  /** Times round the loop, from 0. */
  loop: number
  countIn: boolean
}

export interface TimelineOptions {
  bpm: number
  beatsPerBar: number
  bars: number
  countInBars: number
}

/**
 * Pure position arithmetic: beat index to time and back, with a tempo scale
 * that can move without the music jumping. No audio, no timers — which is what
 * makes the whole beat grid testable without a browser.
 */
export class Timeline {
  readonly bpm: number
  readonly beatsPerBar: number
  readonly bars: number
  readonly countInBars: number
  private anchorTime = 0
  private anchorBeat = 0
  private scale = 1

  constructor({ bpm, beatsPerBar, bars, countInBars }: TimelineOptions) {
    this.bpm = bpm
    this.beatsPerBar = beatsPerBar
    this.bars = bars
    this.countInBars = countInBars
  }

  get secondsPerBeat(): number {
    return 60 / (this.bpm * this.scale)
  }

  get tempoScale(): number {
    return this.scale
  }

  get countInBeats(): number {
    return this.countInBars * this.beatsPerBar
  }

  get loopBeats(): number {
    return this.bars * this.beatsPerBar
  }

  start(time: number): void {
    this.anchorTime = time
    this.anchorBeat = 0
  }

  /**
   * Re-anchors on the current position, so changing tempo bends the grid from
   * here rather than sliding everything already played.
   */
  setTempoScale(scale: number, at: number): void {
    this.anchorBeat = this.beatAt(at)
    this.anchorTime = at
    this.scale = scale
  }

  timeOf(index: number): number {
    return this.anchorTime + (index - this.anchorBeat) * this.secondsPerBeat
  }

  /** Fractional beat index at a time, for anything that needs sub-beat position. */
  beatAt(time: number): number {
    return this.anchorBeat + (time - this.anchorTime) / this.secondsPerBeat
  }

  at(index: number): Beat {
    if (index < this.countInBeats) {
      return { index, bar: -1, beat: index % this.beatsPerBar, loop: 0, countIn: true }
    }
    const n = index - this.countInBeats
    return {
      index,
      bar: Math.floor((n % this.loopBeats) / this.beatsPerBar),
      beat: n % this.beatsPerBar,
      loop: Math.floor(n / this.loopBeats),
      countIn: false,
    }
  }
}

export interface TransportOptions {
  /** Audio time, in seconds. */
  clock: () => number
  /** Called once per beat, with the exact time that beat lands on. */
  onBeat: (beat: Beat, time: number) => void
  /** How far ahead to schedule. Long enough to survive a stalled timer. */
  lookaheadSec?: number
  /** How often to look. Short enough that the lookahead is never exhausted. */
  tickMs?: number
}

const LOOKAHEAD_SEC = 0.12
const TICK_MS = 25
/** A beat of slack before the first, so the count-in never starts mid-schedule. */
const LEAD_IN_SEC = 0.1

export class Transport {
  readonly timeline: Timeline
  private readonly options: TransportOptions
  private timer: ReturnType<typeof setInterval> | null = null
  private next = 0
  private readonly lookahead: number
  private readonly tickMs: number

  // Fields are assigned explicitly rather than declared as constructor
  // parameters: the test runner strips types rather than compiling them.
  constructor(timeline: Timeline, options: TransportOptions) {
    this.timeline = timeline
    this.options = options
    this.lookahead = options.lookaheadSec ?? LOOKAHEAD_SEC
    this.tickMs = options.tickMs ?? TICK_MS
  }

  get running(): boolean {
    return this.timer !== null
  }

  start(): void {
    if (this.timer) return
    this.timeline.start(this.options.clock() + LEAD_IN_SEC)
    this.next = 0
    this.timer = setInterval(() => this.tick(), this.tickMs)
    this.tick()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /** Schedules every beat that has come into view. Idempotent per beat. */
  tick(): void {
    const horizon = this.options.clock() + this.lookahead
    while (this.timeline.timeOf(this.next) < horizon) {
      const index = this.next++
      this.options.onBeat(this.timeline.at(index), this.timeline.timeOf(index))
    }
  }
}
