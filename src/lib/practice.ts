import type { Key } from './chords.ts'
import { COUNT_IN, PATTERNS, buildKit, hitsOn, type DrumKit } from './drums.ts'
import { fingersForDegree, fingersForVoicing, type PoseTarget } from './pose.ts'
import { chordOf, type Song } from './songs.ts'
import { Timeline, Transport, type Beat } from './transport.ts'

/**
 * A practice session: the song, the clock, the target, and an honest account of
 * whether you hit it. Everything here is timed in the audio clock's domain and
 * graded in the hand's — those are different clocks and conflating them is how
 * a guide mode ends up telling every player they are permanently late.
 */

export type Mode = 'play' | 'learn'

/**
 * Four ways to miss, because they are four different problems. "Wrong" teaches
 * nothing; "the degree was right and the wrist was not" teaches the next bar.
 */
export type Grade = 'clean' | 'late' | 'quality' | 'wrong' | 'missed'

export interface Target extends PoseTarget {
  bar: number
  degree: number
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
  bar: number
  name: string
  grade: Grade
  offsetMs: number
}

export interface Summary {
  hits: number
  bars: number
  worst: Result | null
}

export interface PracticeState {
  mode: Mode
  running: boolean
  tempoScale: number
  countIn: boolean
  bar: number
  beat: number
  beatMs: number
  lane: Target[]
  result: Result | null
  summary: Summary | null
}

/** Inside this much of the downbeat, the chord was on the beat. */
const ON_TIME_BEATS = 0.25
/** Past this, it was not late — it was the next thing you tried. */
const LATE_BEATS = 1.5
const HISTORY = 32
const LANE = 4

/**
 * What one bar asked for against what the hands did, as a pure function of the
 * two. A chord arrived at early and held is the ideal rather than a fault, so
 * the question asked is "what was sounding on the downbeat", not "was a change
 * made near it".
 */
export function gradeBar(target: Target, commits: Commit[], barStart: number, beatMs: number): Result {
  const matches = (c: Commit) => c.degree === target.degree && c.major === target.major
  const base = { bar: target.bar, name: target.name }
  const tolerance = barStart + ON_TIME_BEATS * beatMs

  const sounding = commits.filter((c) => c.at <= tolerance).pop()
  if (sounding && matches(sounding)) {
    return { ...base, grade: 'clean', offsetMs: Math.max(0, Math.round(sounding.at - barStart)) }
  }

  const window = commits.filter((c) => c.at > barStart - beatMs && c.at <= barStart + LATE_BEATS * beatMs)
  const late = window.find((c) => c.at > tolerance && matches(c))
  if (late) return { ...base, grade: 'late', offsetMs: Math.round(late.at - barStart) }

  const quality = window.find((c) => c.degree === target.degree)
  if (quality) return { ...base, grade: 'quality', offsetMs: Math.round(quality.at - barStart) }

  if (window.length) return { ...base, grade: 'wrong', offsetMs: 0 }
  return { ...base, grade: 'missed', offsetMs: 0 }
}

export interface SessionAudio {
  context: BaseAudioContext
  destination: AudioNode
}

export interface SessionOptions {
  song: Song
  key: Key
  mode: Mode
  audio: SessionAudio | null
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
  private readonly audio: SessionAudio | null
  private readonly onChange: (state: PracticeState) => void
  private readonly clock: () => number
  private readonly nowMs: () => number

  private timeline: Timeline
  private transport: Transport | null = null
  private kit: DrumKit | null = null
  private pending: ReturnType<typeof setTimeout>[] = []

  private bar = -1
  private beat = 0
  private countIn = true
  private barStart = 0
  private barsPlayed = 0
  private commits: Commit[] = []
  private tally: Result[] = []
  private result: Result | null = null
  private summary: Summary | null = null

  constructor(options: SessionOptions) {
    this.song = options.song
    this.key = options.key
    this.mode = options.mode
    this.audio = options.audio
    this.onChange = options.onChange
    this.clock = options.clock ?? (() => (options.audio ? options.audio.context.currentTime : 0))
    this.nowMs = options.nowMs ?? (() => performance.now())
    this.timeline = this.buildTimeline()
  }

  private buildTimeline(): Timeline {
    return new Timeline({
      bpm: this.song.bpm,
      beatsPerBar: this.song.beatsPerBar,
      bars: this.song.bars.length,
      countInBars: this.song.countInBars,
    })
  }

  get running(): boolean {
    return this.mode === 'learn' ? this.bar >= 0 : (this.transport?.running ?? false)
  }

  /** The pose the song is asking for, drawn on the player's own hand. */
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
    })
    this.transport.start()
    this.publish()
  }

  stop(): void {
    this.transport?.stop()
    this.transport = null
    this.kit?.dispose()
    this.kit = null
    for (const timer of this.pending) clearTimeout(timer)
    this.pending = []
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
  }

  setKey(key: Key): void {
    this.key = key
    this.publish()
  }

  setSong(song: Song): void {
    const wasRunning = this.running
    this.stop()
    this.song = song
    this.timeline = this.buildTimeline()
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

    if (this.mode !== 'learn' || this.bar < 0) return
    const target = this.lane()[0]
    if (degree !== target.degree || major !== target.major) return

    this.result = { bar: target.bar, name: target.name, grade: 'clean', offsetMs: 0 }
    this.bar = (this.bar + 1) % this.song.bars.length
    this.publish()
  }

  /** Audio is scheduled ahead; the display and the grading wait for the beat. */
  private schedule(beat: Beat, time: number): void {
    const spb = this.timeline.secondsPerBeat
    const pattern = beat.countIn ? COUNT_IN : PATTERNS[this.song.kit]
    for (const { hit, offset } of hitsOn(pattern, beat.beat)) {
      this.kit?.trigger(hit.voice, time + offset * spb, hit.gain)
    }

    const delayMs = (time - this.clock()) * 1000
    const atMs = this.nowMs() + delayMs
    this.pending.push(setTimeout(() => this.arrive(beat, atMs), Math.max(0, delayMs)))
  }

  private arrive(beat: Beat, atMs: number): void {
    this.beat = beat.beat
    this.countIn = beat.countIn

    if (beat.countIn) {
      this.bar = -1
      this.publish()
      return
    }

    if (beat.beat === 0) {
      this.bar = beat.bar
      this.barStart = atMs
      this.barsPlayed++
    }

    // The bar just gone is graded one beat into the next, which is how long a
    // late chord has to arrive and still be a late chord rather than a wrong one.
    // Nothing is graded until a bar has actually gone.
    if (beat.beat === 1 && this.barsPlayed > 1) this.judge()

    this.publish()
  }

  private judge(): void {
    const previous = (this.bar - 1 + this.song.bars.length) % this.song.bars.length
    const target = this.targetAt(previous)
    const beatMs = this.timeline.secondsPerBeat * 1000
    const result = gradeBar(target, this.commits, this.barStart - this.song.beatsPerBar * beatMs, beatMs)

    this.result = result
    this.tally.push(result)
    if (this.tally.length >= this.song.bars.length) {
      const misses = this.tally.filter((r) => r.grade !== 'clean')
      this.summary = {
        hits: this.tally.length - misses.length,
        bars: this.tally.length,
        worst: misses[0] ?? null,
      }
      this.tally = []
    }
  }

  private reset(): void {
    this.commits = []
    this.barsPlayed = 0
    this.tally = []
    this.result = null
    this.summary = null
    this.bar = -1
    this.beat = 0
    this.countIn = true
  }

  private targetAt(bar: number): Target {
    const count = this.song.bars.length
    const index = ((bar % count) + count) % count
    const chord = chordOf(this.key, this.song.bars[index])
    return {
      bar: index,
      degree: chord.degree,
      major: chord.major,
      fingers: fingersForDegree(chord.degree),
      // Every song here is accompaniment, so the colour hand holds root
      // position throughout. It is still worth showing: a player who does not
      // know what to do with their right hand does something with it anyway.
      right: fingersForVoicing(chord.voicing, chord.octaveDown),
      name: chord.name,
      numeral: chord.numeral,
    }
  }

  private lane(): Target[] {
    const from = Math.max(0, this.bar)
    return Array.from({ length: LANE }, (_, i) => this.targetAt(from + i))
  }

  get state(): PracticeState {
    return {
      mode: this.mode,
      running: this.running,
      tempoScale: this.timeline.tempoScale,
      countIn: this.countIn,
      bar: this.bar,
      beat: this.beat,
      beatMs: this.timeline.secondsPerBeat * 1000,
      lane: this.lane(),
      result: this.result,
      summary: this.summary,
    }
  }

  private publish(): void {
    this.onChange(this.state)
  }
}
