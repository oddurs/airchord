import type { Fingers, HandState } from './vision'
import { CONFIDENCE_FLOOR, FingerClassifier } from './classifier'
import { buildChord, degreeFromFingers, leanToMajor, voicingFromFingers, type Chord, type Key } from './chords'
import { Committer, Grace, Smoothed } from './smoothing'
import type { PoseTarget } from './pose'
import { Synth, type AudioBridge, type Wave } from './synth'
import { Overlay } from './overlay'

/**
 * Confidence and latency are one dial, so the two decisions get their own.
 * A wrong chord is a wrong note and must be certain; a wrong voicing on a chord
 * already sounding is a colour error, and waiting on it just adds lag.
 */
const CHORD_HOLD_MS = 100
const COLOUR_HOLD_MS = 40

/**
 * A chord the song is about to ask for commits sooner. The pose still has to be
 * made — this buys latency with *expectation*, not with certainty, and the only
 * chord it accepts early is the one already predicted. It is the cheapest
 * latency win the instrument has, and it exists only because there is a song.
 */
const EXPECTED_HOLD_MS = 45

/** A hand that vanishes for a moment has been dropped by the tracker, not lowered. */
const HAND_GRACE_MS = 220
const EXPRESSION_GRACE_MS = 60

/** Below this, a hand is being rested rather than played. */
const REST_HEIGHT = 0.06


/** Everything the HUD renders, quantised so React only wakes on real change. */
export interface Hud {
  name: string | null
  numeral: string | null
  quality: string | null
  octaveDown: boolean
  filter: number
  volume: number
  hands: number
  latched: boolean
}

export const IDLE_HUD: Hud = {
  name: null,
  numeral: null,
  quality: null,
  octaveDown: false,
  filter: 0,
  volume: 0,
  hands: 0,
  latched: false,
}

export interface FrameInput {
  hands: HandState[]
  video: HTMLVideoElement
  key: Key
  now: number
  /** Time the hand tracker spent on this frame, for the latency budget. */
  inferenceMs: number
}

interface Identity {
  degree: number
  major: boolean
}

interface Colour {
  voicing: number
  octaveDown: boolean
}

/** Per-hand memory: finger latches plus smoothing on the continuous axes. */
class HandStabiliser {
  private classifier = new FingerClassifier()
  private rollFilter = new Smoothed(0.35)
  private tiltFilter = new Smoothed(0.3)
  private heightFilter = new Smoothed(0.4)

  fingers(hand: HandState): Fingers {
    return this.classifier.update(hand)
  }

  roll(value: number): number {
    return this.rollFilter.update(value)
  }

  tilt(value: number): number {
    return this.tiltFilter.update(value)
  }

  height(value: number): number {
    return this.heightFilter.update(value)
  }
}

/**
 * Owns the per-frame mapping from hands to sound and pixels. Kept outside React
 * so the 60fps loop never touches the component tree.
 */
export class Engine {
  private synth = new Synth()
  private overlay: Overlay
  private stable = { left: new HandStabiliser(), right: new HandStabiliser() }
  private leftGrace = new Grace<HandState>(HAND_GRACE_MS)
  private rightGrace = new Grace<HandState>(EXPRESSION_GRACE_MS)
  private identity = new Committer<Identity>(CHORD_HOLD_MS)
  private colour = new Committer<Colour>(COLOUR_HOLD_MS)
  private isMajor = true
  private held: Identity | null = null
  /** The pose a song is asking for, drawn on the hand that has to make it. */
  private target: PoseTarget | null = null
  private lastCommit: string | null = null
  private lastFrame = 0
  private fps = new Smoothed(0.1)
  private observer: ((hands: HandState[]) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.overlay = new Overlay(canvas)
  }

  start(): Promise<void> {
    return this.synth.start()
  }

  setWave(wave: Wave): void {
    this.synth.setWave(wave)
  }

  /** The clock, the bus and the articulation a backing track needs to be in
   *  time with the chords. Null until the player has started. */
  get audio(): AudioBridge | null {
    return this.synth.audio
  }

  /**
   * The sustain pedal. Freezes which chord is sounding so the arms can come
   * down, while leaving voicing, filter and volume live — a latched chord can
   * still be shaped, which is the difference between a hold and a recording.
   */
  setLatched(on: boolean): void {
    this.held = on ? this.identity.current : null
  }

  get latched(): boolean {
    return this.held !== null
  }

  setTarget(target: PoseTarget | null): void {
    this.target = target
  }

  /**
   * Every chord the player commits, timed at the moment their *hand* arrived —
   * the hold has already elapsed by the time it is accepted here. Grading the
   * pipeline as if it were the player is how a guide mode ends up telling
   * everyone they are permanently late.
   */
  onCommit: ((degree: number, major: boolean, at: number) => void) | null = null

  /** Lets the capture tool see every frame without threading it through React. */
  observe(callback: ((hands: HandState[]) => void) | null): void {
    this.observer = callback
  }

  dispose(): void {
    this.synth.dispose()
    this.overlay.dispose()
  }

  frame({ hands, video, key, now, inferenceMs }: FrameInput): Hud {
    const interval = this.lastFrame ? now - this.lastFrame : 0
    this.lastFrame = now
    if (interval > 0) this.fps.update(1000 / interval)

    // A hand the tracker is unsure about should not be driving an instrument.
    const seen = hands.filter((h) => h.confidence >= CONFIDENCE_FLOOR)
    this.observer?.(seen)
    const left = this.leftGrace.update(seen.find((h) => h.side === 'left') ?? null, now)
    const right = this.rightGrace.update(seen.find((h) => h.side === 'right') ?? null, now)

    const leftFingers = left && this.stable.left.fingers(left)
    const rightFingers = right && this.stable.right.fingers(right)
    const leftHeight = left ? this.stable.left.height(left.height) : 0

    const { volume, tilt } = this.readExpression(right, left, leftHeight)
    this.synth.setTilt(tilt)
    this.isMajor = leanToMajor(left ? this.stable.left.roll(left.roll) : null, this.isMajor)

    // A lowered hand is an instruction and takes effect; an absent one is an
    // accident and is covered by grace. Rest is only read from a hand we can see.
    const resting = seen.some((h) => h.side === 'left') && leftHeight < REST_HEIGHT
    const degree = leftFingers && !resting ? degreeFromFingers(leftFingers) : null

    const identity = degree === null ? null : { degree, major: this.isMajor }
    const expected =
      identity !== null &&
      this.target !== null &&
      identity.degree === this.target.degree &&
      identity.major === this.target.major
    const hold = expected ? EXPECTED_HOLD_MS : CHORD_HOLD_MS
    const committed = this.identity.update(identity, identity && `${identity.degree}|${identity.major}`, now, hold)
    const sounding = this.held ?? committed

    const commitKey = committed && `${committed.degree}|${committed.major}`
    if (commitKey !== this.lastCommit) {
      this.lastCommit = commitKey
      if (committed) this.onCommit?.(committed.degree, committed.major, now - hold)
    }

    const wanted: Colour = {
      voicing: rightFingers ? voicingFromFingers(rightFingers) : 1,
      octaveDown: rightFingers?.[0] ?? false,
    }
    const colour =
      this.colour.update(wanted, `${wanted.voicing}|${wanted.octaveDown}`, now) ?? wanted

    const chord = sounding && buildChord(key, { ...sounding, ...colour })
    if (chord) {
      this.synth.play(chord.freqs)
      this.synth.setVolume(volume)
    } else {
      this.synth.stop()
    }

    this.overlay.drawFrame(video)
    this.overlay.drawHands(hands)
    if (this.target) {
      const target = this.target
      if (left) {
        const reached = committed?.degree === target.degree && committed?.major === target.major
        this.overlay.drawGhost(left, target.fingers, reached, { major: target.major })
      }
      // The colour hand gets a ghost too. It holds one pose for a whole song,
      // which is exactly why a player who is not told about it never finds it.
      if (right && rightFingers) {
        const reached = target.right.every((up, i) => up === rightFingers[i])
        this.overlay.drawGhost(right, target.right, reached)
      }
    }
    if (chord) {
      this.overlay.drawWave({
        freqs: chord.freqs,
        degree: chord.degree,
        major: chord.major,
        volume,
        tilt,
        now,
      })
    }

    if (process.env.NODE_ENV !== 'production') {
      this.report(left, right, chord, inferenceMs, interval)
    }

    return {
      name: chord?.name ?? null,
      numeral: chord?.numeral ?? null,
      quality: chord?.quality ?? null,
      octaveDown: chord?.octaveDown ?? false,
      filter: Math.round(tilt * 100),
      volume: chord ? Math.round(volume * 20) / 20 : 0,
      hands: hands.length,
      latched: this.latched,
    }
  }

  /**
   * The right hand shapes the sound, but the instrument must stay playable
   * with one hand — so when the right is away the left takes over dynamics
   * rather than the volume falling back to an arbitrary constant.
   */
  private readExpression(
    right: HandState | null,
    left: HandState | null,
    leftHeight: number,
  ): { volume: number; tilt: number } {
    if (right) {
      return {
        volume: this.stable.right.height(right.height),
        tilt: this.stable.right.tilt(right.tilt),
      }
    }
    if (left) return { volume: leftHeight, tilt: 0 }
    return { volume: 0.5, tilt: 0 }
  }

  /** Dev-only: raw features plus the latency budget, for tuning against real play. */
  private report(
    left: HandState | null,
    right: HandState | null,
    chord: Chord | null,
    inferenceMs: number,
    interval: number,
  ): void {
    const summarise = (h: HandState | null) =>
      h && {
        extension: h.extension.map((v) => Number(v.toFixed(3))),
        thumb: h.thumb,
        spread: Number(h.spread.toFixed(3)),
        confidence: Number(h.confidence.toFixed(3)),
        roll: Number(h.roll.toFixed(3)),
        tilt: Number(h.tilt.toFixed(3)),
        height: Number(h.height.toFixed(3)),
      }
    const audioMs = this.synth.latencyMs
    ;(window as Window & { __airchord?: unknown }).__airchord = {
      left: summarise(left),
      right: summarise(right),
      chord: chord && { name: chord.name, numeral: chord.numeral, quality: chord.quality },
      latched: this.latched,
      timing: {
        fps: Number(this.fps.update(interval > 0 ? 1000 / interval : 0).toFixed(1)),
        frameMs: Number(interval.toFixed(1)),
        inferenceMs: Number(inferenceMs.toFixed(1)),
        commitMs: CHORD_HOLD_MS,
        audioMs: Number(audioMs.toFixed(1)),
        estimatedMs: Number((interval + inferenceMs + CHORD_HOLD_MS + audioMs).toFixed(1)),
      },
    }
  }
}

export function hudEqual(a: Hud, b: Hud): boolean {
  return (
    a.name === b.name &&
    a.numeral === b.numeral &&
    a.quality === b.quality &&
    a.octaveDown === b.octaveDown &&
    a.filter === b.filter &&
    a.volume === b.volume &&
    a.hands === b.hands &&
    a.latched === b.latched
  )
}
