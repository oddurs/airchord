import type { Key } from './chords.ts'
import { buildKit, type DrumKit } from './drums.ts'
import { COUNT_IN, GROOVES, SECTION_CRASH, eventsOn, type Hit } from './groove.ts'
import { fingersForDegree, fingersForVoicing, type PoseTarget } from './pose.ts'
import { arrange, chordOf, loopOf, numeralOf, type Change, type Placed, type Song } from './songs.ts'
import type { AudioBridge } from './synth.ts'
import { Timeline, Transport, type Beat } from './transport.ts'

/**
 * A practice session: the song, the clock, the groove, the target, and an honest
 * account of whether you hit it. Everything here is timed in the audio clock's
 * domain and graded in the hand's — those are different clocks, and conflating
 * them is how a guide mode ends up telling every player they are permanently
 * late.
 */

export type Mode = 'play' | 'learn'

/**
 * Four ways to miss, because they are four different problems. "Wrong" teaches
 * nothing; "the degree was right and the wrist was not" teaches the next bar.
 */
export type Grade = 'clean' | 'late' | 'quality' | 'wrong' | 'missed'

export interface Target extends PoseTarget {
  /** Where in the arrangement this change happens. */
  bar: number
  beat: number
  section: string
  name: string
  numeral: string
}

/** A chord the player committed, timed at the moment their hand arrived. */
export interface Commit {
  degree: number
  major: boolean
  at: number
}

export interface Result {
  name: string
  section: string
  grade: Grade
  offsetMs: number
}

export interface Summary {
  section: string
  hits: number
  changes: number
  worst: Result | null
}

export interface PracticeState {
  mode: Mode
  running: boolean
  /** The arrangement ran out. Songs end. */
  done: boolean
  tempoScale: number
  countIn: boolean
  bar: number
  beat: number
  beatMs: number
  section: string | null
  nextSection: string | null
  barsToNextSection: number | null
  lane: Target[]
  result: Result | null
  summary: Summary | null
  /** The whole song so far, for the report at the end of it. */
  total: { hits: number; changes: number }
}

/** Inside this much of the beat, the chord was on it. */
const ON_TIME_BEATS = 0.25
/** Past this, it was not late — it was the next thing you tried. */
const LATE_BEATS = 1.5
const HISTORY = 32
const LANE = 4

/** A few milliseconds of imprecision, because a perfectly quantised kit is most
 *  of why a metronome sounds like a metronome. */
const HUMANISE_SEC = 0.006
const HUMANISE_GAIN = 0.1

/**
 * What one change asked for against what the hands did, as a pure function of
 * the two. A chord arrived at early and held is the ideal rather than a fault,
 * so the question asked is "what was sounding when it was due", not "was a
 * change made near it".
 */
export function gradeChange(target: Target, commits: Commit[], due: number, beatMs: number): Result {
  const matches = (c: Commit) => c.degree === target.degree && c.major === target.major
  const base = { name: target.name, section: target.section }
  const tolerance = due + ON_TIME_BEATS * beatMs

  const sounding = commits.filter((c) => c.at <= tolerance).pop()
  if (sounding && matches(sounding)) {
    return { ...base, grade: 'clean', offsetMs: Math.max(0, Math.round(sounding.at - due)) }
  }

  const window = commits.filter((c) => c.at > due - beatMs && c.at <= due + LATE_BEATS * beatMs)
  const late = window.find((c) => c.at > tolerance && matches(c))
  if (late) return { ...base, grade: 'late', offsetMs: Math.round(late.at - due) }

  const quality = window.find((c) => c.degree === target.degree)
  if (quality) return { ...base, grade: 'quality', offsetMs: Math.round(quality.at - due) }

  if (window.length) return { ...base, grade: 'wrong', offsetMs: 0 }
  return { ...base, grade: 'missed', offsetMs: 0 }
}

export interface SessionOptions {
  song: Song
  key: Key
  mode: Mode
  audio: AudioBridge | null
  onChange: (state: PracticeState) => void
  /** Audio time in seconds and wall time in ms, injectable so a session can be
   *  driven in tests without a browser. */
  clock?: () => number
  nowMs?: () => number
}

export class PracticeSession {
  private song: Song
  private key: Key
  private mode: Mode
  private readonly audio: AudioBridge | null
  private readonly onChange: (state: PracticeState) => void
  private readonly clock: () => number
  private readonly nowMs: () => number

  private chart: Placed[] = []
  private timeline: Timeline
  private transport: Transport | null = null
  private kit: DrumKit | null = null
  private pending: ReturnType<typeof setTimeout>[] = []

  private bar = -1
  private beat = 0
  private countIn = true
  private done = false
  private commits: Commit[] = []
  private tally: { section: string; results: Result[] } | null = null
  private result: Result | null = null
  private summary: Summary | null = null
  private total = { hits: 0, changes: 0 }

  constructor(options: SessionOptions) {
    this.song = options.song
    this.key = options.key
    this.mode = options.mode
    this.audio = options.audio
    this.onChange = options.onChange
    this.clock = options.clock ?? (() => (options.audio ? options.audio.context.currentTime : 0))
    this.nowMs = options.nowMs ?? (() => performance.now())
    this.chart = this.buildChart()
    this.timeline = this.buildTimeline()
  }

  /** Play walks the arrangement and stops at the end of it. Learn walks the
   *  song's distinct bars and goes round: there is nothing to learn from
   *  playing the same four bars twenty-four times. */
  private buildChart(): Placed[] {
    return this.mode === 'learn' ? loopOf(this.song) : arrange(this.song)
  }

  private buildTimeline(): Timeline {
    return new Timeline({
      beatsPerBar: this.song.beatsPerBar,
      bars: this.chart.length,
      countInBars: this.song.countInBars,
      tempo: [{ bar: 0, bpm: this.song.bpm }, ...(this.song.tempoChanges ?? [])],
    })
  }

  private rebuild(): void {
    this.chart = this.buildChart()
    this.timeline = this.buildTimeline()
  }

  get running(): boolean {
    return this.mode === 'learn' ? this.bar >= 0 && !this.done : (this.transport?.running ?? false)
  }

  /** The pose the song is asking for, drawn on the player's own hands. */
  get target(): Target | null {
    return this.lane()[0] ?? null
  }

  start(): void {
    this.stop()
    this.reset()

    if (this.mode === 'learn') {
      this.bar = 0
      this.countIn = false
      this.publish()
      return
    }

    if (this.audio) this.kit = buildKit(this.audio.context, this.audio.destination)
    this.transport = new Transport(this.timeline, {
      clock: this.clock,
      onBeat: (beat, time) => this.schedule(beat, time),
      onEnd: (time) => this.at(time, () => this.finish()),
    })
    this.transport.start()
    this.publish()
  }

  /**
   * Holds position. Pending timers are cleared for the same reason `stop` clears
   * them: they carry display updates and judgements scheduled against wall time,
   * and left alone they fire during the pause and grade bars that never played.
   *
   * The bar in flight is dropped rather than graded. Its window is wall-clock
   * milliseconds, so a pause through the middle of it makes the judgement
   * meaningless — and a bar interrupted by a pause is not one the player missed.
   */
  pause(): void {
    if (this.transport?.state !== 'playing') return
    this.transport.pause()
    this.clearPending()
    this.bar = -1
    this.publish()
  }

  resume(): void {
    if (this.transport?.state !== 'paused') return
    this.transport.resume()
    this.publish()
  }

  /** Play, hold, or pick up — whichever the current state calls for. */
  toggle(): void {
    if (!this.transport) this.start()
    else if (this.transport.state === 'playing') this.pause()
    else if (this.transport.state === 'paused') this.resume()
    else this.start()
  }

  get transportState(): 'stopped' | 'playing' | 'paused' {
    return this.transport?.state ?? 'stopped'
  }

  private clearPending(): void {
    for (const timer of this.pending) clearTimeout(timer)
    this.pending = []
  }

  stop(): void {
    this.transport?.stop()
    this.transport = null
    this.kit?.dispose()
    this.kit = null
    this.clearPending()
    this.bar = -1
    this.countIn = true
    this.publish()
  }

  dispose(): void {
    this.stop()
  }

  setMode(mode: Mode): void {
    this.mode = mode
    this.stop()
    this.rebuild()
    this.publish()
  }

  setKey(key: Key): void {
    this.key = key
    this.publish()
  }

  setSong(song: Song): void {
    const wasRunning = this.running
    this.stop()
    this.song = song
    this.rebuild()
    if (wasRunning) this.start()
    else this.publish()
  }

  setTempoScale(scale: number): void {
    this.timeline.setTempoScale(scale, this.clock())
    this.publish()
  }

  /**
   * A chord the player reached, timed at the moment their hand arrived rather
   * than the moment the sound began — the engine has already subtracted its own
   * commit hold, so what is graded is the hand.
   */
  commit(degree: number, major: boolean, at: number): void {
    this.commits.push({ degree, major, at })
    if (this.commits.length > HISTORY) this.commits.shift()

    if (this.mode !== 'learn' || this.bar < 0 || this.done) return
    const target = this.lane()[0]
    if (!target || degree !== target.degree || major !== target.major) return

    this.result = { name: target.name, section: target.section, grade: 'clean', offsetMs: 0 }
    this.advance(target)
    this.publish()
  }

  /** Learn mode has no clock, so the song moves when the player does. */
  private advance(from: Target): void {
    const changes = this.chart[this.bar]?.bar ?? []
    const next = changes.findIndex((c) => c.beat > from.beat)
    if (next >= 0) {
      this.beat = Math.floor(changes[next].beat)
      return
    }
    this.beat = 0
    this.bar = (this.bar + 1) % this.chart.length
  }

  /**
   * Audio is scheduled ahead on the exact beat; the display and the grading wait
   * for it. A change inside the bar gets the same treatment as a downbeat — the
   * unit here is the chord change, not the bar.
   */
  private schedule(beat: Beat, time: number): void {
    const spb = this.timeline.secondsPerBeatAt(beat.index)

    if (beat.countIn) {
      this.play(COUNT_IN, beat.beat, time, spb, 0)
      this.at(time, () => this.mark(beat))
      return
    }

    const placed = this.chart[beat.bar]
    if (!placed) return
    const groove = GROOVES[placed.section.intensity]
    const swing = this.song.swing

    this.play(placed.lastOfSection ? groove.fill : groove.drums, beat.beat, time, spb, swing)
    if (beat.beat === 0 && placed.barInSection === 0 && placed.index > 0 && placed.section.intensity !== 'silent') {
      this.play([SECTION_CRASH], 0, time, spb, 0)
    }

    for (const { event, offset } of eventsOn(groove.strum, beat.beat, swing)) {
      this.audio?.strike(time + offset * spb, event.velocity)
    }

    this.at(time, () => this.mark(beat))

    for (const { event, offset } of eventsOn(placed.bar, beat.beat)) {
      const target = this.targetFor(placed, event)
      const at = time + offset * spb
      this.at(at, () => this.arrive(target))
      this.at(at + spb, (_, dueMs) => this.judge(target, dueMs, spb * 1000), at)
    }
  }

  private play(hits: Hit[], beat: number, time: number, spb: number, swing: number): void {
    for (const { event, offset } of eventsOn(hits, beat, swing)) {
      const jitter = (Math.random() - 0.5) * HUMANISE_SEC
      const gain = event.gain * (1 - HUMANISE_GAIN / 2 + Math.random() * HUMANISE_GAIN)
      this.kit?.trigger(event.voice, time + offset * spb + jitter, Math.min(1, gain))
    }
  }

  /** Runs `run` when audio time reaches `time`, telling it the wall clock that
   *  moment lands on — which is the domain commits are timed in. */
  private at(time: number, run: (atMs: number, dueMs: number) => void, due = time): void {
    const delayMs = (time - this.clock()) * 1000
    const atMs = this.nowMs() + delayMs
    const dueMs = atMs - (time - due) * 1000
    this.pending.push(setTimeout(() => run(atMs, dueMs), Math.max(0, delayMs)))
  }

  private mark(beat: Beat): void {
    this.beat = beat.beat
    this.countIn = beat.countIn
    this.bar = beat.countIn ? -1 : beat.bar
    this.publish()
  }

  /** A change inside a bar is current from the moment it lands, not from the
   *  next whole beat. */
  private arrive(target: Target): void {
    this.beat = target.beat
    this.publish()
  }

  private judge(target: Target, dueMs: number, beatMs: number): void {
    const result = gradeChange(target, this.commits, dueMs, beatMs)
    this.result = result
    this.record(result)
    this.publish()
  }

  /** A section's worth of changes, reported when the section is over. */
  private record(result: Result): void {
    this.total.changes++
    if (result.grade === 'clean') this.total.hits++
    if (this.tally && this.tally.section !== result.section) this.flush()
    if (!this.tally) this.tally = { section: result.section, results: [] }
    this.tally.results.push(result)
  }

  private flush(): void {
    const tally = this.tally
    this.tally = null
    if (!tally?.results.length) return
    const missed = tally.results.filter((r) => r.grade !== 'clean')
    this.summary = {
      section: tally.section,
      hits: tally.results.length - missed.length,
      changes: tally.results.length,
      worst: missed[0] ?? null,
    }
  }

  private finish(): void {
    this.flush()
    this.done = true
    this.transport?.stop()
    this.publish()
  }

  private reset(): void {
    this.commits = []
    this.tally = null
    this.result = null
    this.summary = null
    this.total = { hits: 0, changes: 0 }
    this.bar = -1
    this.beat = 0
    this.countIn = true
    this.done = false
  }

  private targetFor(placed: Placed, change: Change): Target {
    const chord = chordOf(this.key, change)
    return {
      bar: placed.index,
      beat: change.beat,
      section: placed.section.name,
      degree: chord.degree,
      major: chord.major,
      fingers: fingersForDegree(chord.degree),
      // Every song here is accompaniment, so the colour hand holds root position
      // throughout. It is still worth showing: a player who does not know what
      // to do with their right hand does something with it anyway.
      right: fingersForVoicing(chord.voicing),
      name: chord.name,
      numeral: numeralOf(this.song, chord),
    }
  }

  /** This change and the next three, wherever they fall. */
  private lane(): Target[] {
    const lane: Target[] = []
    const from = Math.max(0, this.bar)
    for (let step = 0; step < this.chart.length && lane.length < LANE; step++) {
      const index = this.mode === 'learn' ? (from + step) % this.chart.length : from + step
      const placed = this.chart[index]
      if (!placed) break
      for (const change of placed.bar) {
        if (step === 0 && change.beat < this.beat) continue
        if (lane.length < LANE) lane.push(this.targetFor(placed, change))
      }
    }
    return lane
  }

  /** Where the transport is, in its own beat numbering. */
  private get beatIndex(): number {
    return this.timeline.countInBeats + Math.max(0, this.bar) * this.song.beatsPerBar + Math.floor(this.beat)
  }

  get state(): PracticeState {
    const placed = this.bar >= 0 ? this.chart[this.bar] : null
    const next = placed ? this.chart.find((p) => p.index > placed.index && p.section !== placed.section) : null

    return {
      mode: this.mode,
      running: this.running,
      done: this.done,
      tempoScale: this.timeline.tempoScale,
      countIn: this.countIn,
      bar: this.bar,
      beat: this.beat,
      beatMs: this.timeline.secondsPerBeatAt(this.beatIndex) * 1000,
      section: placed?.section.name ?? null,
      nextSection: next?.section.name ?? null,
      barsToNextSection: next && placed ? next.index - placed.index : null,
      lane: this.lane(),
      result: this.result,
      summary: this.summary,
      total: this.total,
    }
  }

  private publish(): void {
    this.onChange(this.state)
  }
}
