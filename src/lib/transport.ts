import type { TempoMark } from './songs.ts'

/**
 * The clock. Beats are scheduled ahead on the audio context's own timeline —
 * `setInterval` only decides *when to look*, never when a sound happens. A drum
 * machine driven by timers or by `requestAnimationFrame` drifts audibly within a
 * few bars, and a metronome that drifts is worse than none.
 */

export interface Beat {
  /** Beats since the transport started, count-in included. */
  index: number
  /** Bar of the arrangement, or -1 during the count-in. */
  bar: number
  /** Beat within the bar, from 0. */
  beat: number
  countIn: boolean
}

export interface TimelineOptions {
  beatsPerBar: number
  /** Bars in the arrangement. The song ends after them. */
  bars: number
  countInBars: number
  /** Tempo marks by arrangement bar; there must be one at bar 0. */
  tempo: TempoMark[]
}

/** A stretch of constant tempo, in both domains at once. */
interface Segment {
  fromBeat: number
  fromTime: number
  secondsPerBeat: number
}

/**
 * Pure position arithmetic: beat index to time and back, across a tempo map,
 * with a tempo scale that can move without the music jumping. No audio, no
 * timers — which is what makes the whole beat grid testable without a browser.
 */
export class Timeline {
  readonly beatsPerBar: number
  readonly bars: number
  readonly countInBars: number
  private readonly tempo: TempoMark[]
  private segments: Segment[] = []
  private origin = 0
  private scale = 1

  constructor({ beatsPerBar, bars, countInBars, tempo }: TimelineOptions) {
    this.beatsPerBar = beatsPerBar
    this.bars = bars
    this.countInBars = countInBars
    this.tempo = [...tempo].sort((a, b) => a.bar - b.bar)
    if (!this.tempo.length || this.tempo[0].bar !== 0) {
      throw new Error('A tempo map has to start at bar 0')
    }
    this.build()
  }

  /** The count-in runs at the opening tempo, so the first segment starts at the
   *  very first beat rather than at bar 0 of the song. */
  private build(): void {
    const countIn = this.countInBars * this.beatsPerBar
    let time = 0
    this.segments = this.tempo.map((mark, i) => {
      const fromBeat = i === 0 ? 0 : countIn + mark.bar * this.beatsPerBar
      const segment = { fromBeat, fromTime: time, secondsPerBeat: 60 / (mark.bpm * this.scale) }
      const next = this.tempo[i + 1]
      if (next) time += (countIn + next.bar * this.beatsPerBar - fromBeat) * segment.secondsPerBeat
      return segment
    })
  }

  private segmentAtBeat(beat: number): Segment {
    let found = this.segments[0]
    for (const segment of this.segments) if (segment.fromBeat <= beat) found = segment
    return found
  }

  private segmentAtTime(time: number): Segment {
    let found = this.segments[0]
    for (const segment of this.segments) if (segment.fromTime <= time) found = segment
    return found
  }

  get tempoScale(): number {
    return this.scale
  }

  get countInBeats(): number {
    return this.countInBars * this.beatsPerBar
  }

  get totalBeats(): number {
    return this.countInBeats + this.bars * this.beatsPerBar
  }

  /** Seconds per beat where the music is now, which is not one number any more. */
  secondsPerBeatAt(beat: number): number {
    return this.segmentAtBeat(beat).secondsPerBeat
  }

  start(time: number): void {
    this.origin = time
  }

  /** Re-anchors on the current position, so changing tempo bends the grid from
   *  here rather than sliding everything already played. */
  setTempoScale(scale: number, at: number): void {
    const beat = this.beatAt(at)
    this.scale = scale
    this.build()
    this.reanchor(beat, at)
  }

  /** Slides the whole timeline so `beat` lands at `at`, tempo untouched. This is
   *  the one notion of position: resuming from a pause is the same operation. */
  reanchor(beat: number, at: number): void {
    this.origin = at - this.rawTimeOf(beat)
  }

  private rawTimeOf(beat: number): number {
    const segment = this.segmentAtBeat(beat)
    return segment.fromTime + (beat - segment.fromBeat) * segment.secondsPerBeat
  }

  timeOf(index: number): number {
    return this.origin + this.rawTimeOf(index)
  }

  /** Fractional beat index at a time, for anything that needs sub-beat position. */
  beatAt(time: number): number {
    const raw = time - this.origin
    const segment = this.segmentAtTime(raw)
    return segment.fromBeat + (raw - segment.fromTime) / segment.secondsPerBeat
  }

  /** Null past the end of the arrangement: songs finish. */
  at(index: number): Beat | null {
    if (index < this.countInBeats) {
      return { index, bar: -1, beat: index % this.beatsPerBar, countIn: true }
    }
    if (index >= this.totalBeats) return null
    const n = index - this.countInBeats
    return {
      index,
      bar: Math.floor(n / this.beatsPerBar),
      beat: n % this.beatsPerBar,
      countIn: false,
    }
  }
}

export interface TransportOptions {
  /** Audio time, in seconds. */
  clock: () => number
  /** Called once per beat, with the exact time that beat lands on. */
  onBeat: (beat: Beat, time: number) => void
  /** Called once, with the time the last bar runs out. */
  onEnd?: (time: number) => void
  /** Called when position is held, so queued audio can be cancelled. */
  onPause?: (time: number) => void
  /** How far ahead to schedule. Long enough to survive a stalled timer. */
  lookaheadSec?: number
  /** How often to look. Short enough that the lookahead is never exhausted. */
  tickMs?: number
}

const LOOKAHEAD_SEC = 0.12
const TICK_MS = 25
/** A moment of slack before the first beat, so the count-in never starts mid-schedule. */
const LEAD_IN_SEC = 0.1

export class Transport {
  readonly timeline: Timeline
  private readonly options: TransportOptions
  private timer: ReturnType<typeof setInterval> | null = null
  private next = 0
  private ended = false
  /** The beat we were sitting on when held, so resuming re-anchors to it. */
  private pausedBeat: number | null = null
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

  get paused(): boolean {
    return this.pausedBeat !== null
  }

  /** Stopped, playing or paused — three states, because pausing is not stopping. */
  get state(): 'stopped' | 'playing' | 'paused' {
    if (this.timer) return 'playing'
    return this.pausedBeat === null ? 'stopped' : 'paused'
  }

  start(): void {
    if (this.timer) return
    this.timeline.start(this.options.clock() + LEAD_IN_SEC)
    this.next = 0
    this.ended = false
    this.pausedBeat = null
    this.run()
  }

  /**
   * Holds position. Beats already handed to the scheduler inside the lookahead
   * window are rewound so resuming neither skips nor double-books them, and the
   * consumer is told so it can cancel whatever it has already queued.
   */
  pause(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null

    const at = this.options.clock()
    this.pausedBeat = Math.max(0, this.timeline.beatAt(at))

    // Beats already handed out inside the lookahead are rewound, so resuming
    // neither skips them nor books them twice.
    while (this.next > 0 && this.timeline.timeOf(this.next - 1) > at) this.next--
    this.ended = false
    this.options.onPause?.(at)
  }

  /** Picks up where it left off: the held beat is re-anchored to now. */
  resume(): void {
    if (this.timer || this.pausedBeat === null) return
    this.timeline.reanchor(this.pausedBeat, this.options.clock() + LEAD_IN_SEC)
    this.pausedBeat = null
    this.run()
  }

  toggle(): void {
    if (this.timer) this.pause()
    else if (this.pausedBeat !== null) this.resume()
    else this.start()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.pausedBeat = null
    this.next = 0
    this.ended = false
  }

  private run(): void {
    this.timer = setInterval(() => this.tick(), this.tickMs)
    this.tick()
  }

  /** Schedules every beat that has come into view. Idempotent per beat. */
  tick(): void {
    const horizon = this.options.clock() + this.lookahead
    const total = this.timeline.totalBeats

    while (this.next < total && this.timeline.timeOf(this.next) < horizon) {
      const index = this.next++
      this.options.onBeat(this.timeline.at(index)!, this.timeline.timeOf(index))
    }

    if (!this.ended && this.next >= total && this.timeline.timeOf(total) < horizon) {
      this.ended = true
      this.options.onEnd?.(this.timeline.timeOf(total))
    }
  }
}
