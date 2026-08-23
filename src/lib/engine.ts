import type { Fingers, HandState, Side } from './vision'
import { FingerClassifier, THUMB_OFF, THUMB_ON, registerFromHeight, thumbSignal } from './classifier'
import {
  buildChord,
  degreeFromFingers,
  DEFAULT_LEAN,
  isLeaned,
  leanOf,
  majorFor,
  type LeanCalibration,
  voicingFromFingers,
  type Chord,
  type Key,
} from './chords'
import { Committer, Grace, Latch, Smoothed } from './smoothing'
import { STEPS, derive, reachTo01, type Calibration, type Samples, type Step } from './calibration'
import type { PoseTarget } from './pose'
import { Synth, type AudioBridge } from './synth'
import type { TimbreId } from './timbre'
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

/**
 * A hand in transit passes through every pose between where it started and
 * where it is going. Rather than block those, moving simply demands a longer
 * hold — so a deliberate slow change still lands, and a hand on its way
 * somewhere never commits what it passes through.
 */
const MOVING_HOLD_MS = 420
/** Mean landmark travel per frame, in frame widths, that counts as settled. */
const STILL = 0.0035

/** Confidence needs a band too, or a hand at the floor blinks in and out. */
const CONFIDENT_ON = 0.7
const CONFIDENT_OFF = 0.5

/** Starting with your hands already raised should not begin at full volume. */
const EASE_IN_MS = 700

/** Still frames to gather per calibration step. */
const CALIBRATION_FRAMES = 45
/** A beat between steps, so changing pose is never mistaken for the pose. */
const CALIBRATION_SETTLE_MS = 1200



/** Everything the HUD renders, quantised so React only wakes on real change. */
export interface Hud {
  name: string | null
  numeral: string | null
  quality: string | null
  /** -1 an octave down, 0 as written, +1 an octave up. */
  octave: number
  /** Height of the chord hand, 0-1, so the register rail can show where it sits. */
  handHeight: number
  filter: number
  volume: number
  hands: number
  latched: boolean
}

export const IDLE_HUD: Hud = {
  name: null,
  numeral: null,
  quality: null,
  octave: 0,
  handHeight: 0,
  filter: 0,
  volume: 0,
  hands: 0,
  latched: false,
}

/**
 * What the instrument currently believes, in the terms it believes it in.
 *
 * Every bug reported against this thing has been ambiguous — "wrong chord" can
 * mean the degree, the quality, the octave or silence, and each ambiguity costs
 * a round trip through a person playing. This is the cure: the instrument says
 * what it sees, so a report arrives with numbers attached.
 */
export interface Diagnostics {
  /** Why no chord is sounding, or 'playing'. */
  reason: string
  fingers: { left: Fingers | null; right: Fingers | null }
  degree: number | null
  lean: { value: number; engage: number; release: number; leaned: boolean } | null
  register: number
  thumb: { left: number | null; right: number | null; on: number; off: number }
  fps: number
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
  /**
   * The octave belongs here, not with voicing. Commit speed should follow how
   * much of the sound changes: a voicing moves one or two notes, an octave moves
   * every one of them. Sitting in the fast tier is why octave jumps read as
   * lurches.
   */
  octave: number
}

interface Colour {
  voicing: number
}

/** Per-hand memory: finger latches plus smoothing on the continuous axes. */
class HandStabiliser {
  private classifier = new FingerClassifier()
  private previous: { x: number; y: number }[] | null = null
  private motionFilter = new Smoothed(0.4)
  private rollFilter = new Smoothed(0.35)
  private tiltFilter = new Smoothed(0.3)
  private heightFilter = new Smoothed(0.4)

  fingers(hand: HandState): Fingers {
    return this.classifier.update(hand)
  }

  setThumbBand(on: number, off: number): void {
    this.classifier.setThumbBand(on, off)
  }

  /** Mean landmark travel since the last frame: high in transit, near zero held. */
  motion(hand: HandState): number {
    const points = hand.points
    let travel = 0
    if (this.previous && this.previous.length === points.length) {
      for (let i = 0; i < points.length; i++) {
        travel += Math.hypot(points[i].x - this.previous[i].x, points[i].y - this.previous[i].y)
      }
      travel /= points.length
    }
    this.previous = points
    return this.motionFilter.update(travel)
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
  /** Whether the hand is leaned away from upright — not the quality itself.
   *  Quality is that plus what the degree already is in the key. */
  private leaned = false
  /** The player's own upright and their own lean, measured rather than assumed. */
  private lean: LeanCalibration = DEFAULT_LEAN
  private calibration: Calibration | null = null
  private cal: {
    index: number
    samples: Samples
    settleUntil: number
    onStep: (step: Step | null) => void
    onDone: (result: ReturnType<typeof derive>) => void
  } | null = null
  private held: Identity | null = null
  /** The pose a song is asking for, drawn on the hand that has to make it. */
  private target: PoseTarget | null = null
  private lastCommit: string | null = null
  private confident = {
    left: new Latch(CONFIDENT_ON, CONFIDENT_OFF),
    right: new Latch(CONFIDENT_ON, CONFIDENT_OFF),
  }
  /** Held while the chord hand is away, rather than snapping back to centre. */
  private register = 0
  private startedAt = 0
  private lastFrame = 0
  private fps = new Smoothed(0.1)
  private diag: Diagnostics = {
    reason: 'starting',
    fingers: { left: null, right: null },
    degree: null,
    lean: null,
    register: 0,
    thumb: { left: null, right: null, on: THUMB_ON, off: THUMB_OFF },
    fps: 0,
  }
  private observer: ((hands: HandState[]) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.overlay = new Overlay(canvas)
  }

  async start(): Promise<void> {
    await this.synth.start()
    this.startedAt = performance.now()
  }

  /**
   * Everything stops, now, without waiting out a hold. For the exits that are
   * not gestures: the tab being hidden, the camera stream ending, the page going
   * away. Sound continuing into an empty room is the least forgivable bug an
   * instrument can have.
   */
  silence(): void {
    this.identity.release()
    this.held = null
    this.synth.stop()
  }

  setTimbre(id: TimbreId): void {
    this.synth.setTimbre(id)
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

  /**
   * Two held samples: where this player's hand sits upright, and where it sits
   * when they lean for a minor chord. Both ends measured, so the band is placed
   * between two things that were observed rather than one that was assumed.
   */
  beginCalibration(
    onStep: (step: Step | null) => void,
    onDone: (result: ReturnType<typeof derive>) => void,
  ): void {
    this.cal = { index: 0, samples: {}, settleUntil: 0, onStep, onDone }
    onStep(STEPS[0])
  }

  /** Applies a stored or freshly measured calibration to everything it covers. */
  setCalibration(calibration: Calibration): void {
    this.calibration = calibration
    this.lean = calibration.lean
    this.stable.left.setThumbBand(calibration.thumb.on, calibration.thumb.off)
    this.stable.right.setThumbBand(calibration.thumb.on, calibration.thumb.off)
  }

  cancelCalibration(): void {
    this.cal = null
  }

  setLean(cal: LeanCalibration): void {
    this.lean = cal
  }

  /** Read by the on-screen readout at its own pace; the loop never waits on it. */
  get diagnostics(): Diagnostics {
    return this.diag
  }

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
    if (interval > 0) this.diag.fps = this.fps.update(1000 / interval)

    // A hand only counts if the tracker is confident about it and the palm is
    // actually in shot. Landmarks are extrapolated past the frame edge, so a
    // hand sliding out of view keeps producing poses — garbage ones — and those
    // were being played.
    const raw = (side: Side) => hands.find((h) => h.side === side) ?? null
    const usable = (side: Side) => {
      const hand = raw(side)
      const confident = this.confident[side].update(hand?.confidence ?? 0)
      return hand && confident && hand.inFrame ? hand : null
    }

    const liveLeft = usable('left')
    const liveRight = usable('right')
    this.observer?.([liveLeft, liveRight].filter((h): h is HandState => h !== null))

    // Grace keeps a hand alive through a dropped frame. What it must not do is
    // authorise a change: sustaining what is sounding and choosing something new
    // are different acts, and conflating them let a stale hand play a chord that
    // was never made.
    const left = this.leftGrace.update(liveLeft, now)
    const right = this.rightGrace.update(liveRight, now)

    const leftFingers = left && this.stable.left.fingers(left)
    const rightFingers = right && this.stable.right.fingers(right)
    const leftHeight = left ? this.reach(this.stable.left.height(left.height)) : 0

    const { volume, tilt } = this.readExpression(right, left, leftHeight)
    this.synth.setTilt(tilt)


    // A lowered hand is an instruction and takes effect; an absent one is an
    // accident and is covered by grace.
    const resting = liveLeft !== null && leftHeight < REST_HEIGHT
    const degree = liveLeft && leftFingers && !resting ? degreeFromFingers(leftFingers) : null

    // Lean is read against the pose being made, so the degree has to be known
    // first. Neutral is not one angle: people hold a horns pose at a genuinely
    // different attitude from a pointing finger.
    const smoothedRoll = left ? this.stable.left.roll(left.roll) : null
    if (this.cal) this.sample(liveLeft, degree, now)
    this.leaned = isLeaned(smoothedRoll, degree, this.leaned, this.lean)
    const major = majorFor(degree, this.leaned)

    // Register follows the height of the chord hand. It used to ride the right
    // thumb — the least reliable measurement in the instrument, and invisible
    // besides. Height is stable, continuous, and means something before it is
    // learned: lift the chord hand to lift the chord.
    // Only a settled hand changes register. A hand on its way down to rest
    // passes through the bottom of its range, and a hand drifting mid-phrase
    // passes through the top; neither is a request to transpose.
    if (liveLeft && this.stable.left.motion(liveLeft) <= STILL) {
      this.register = registerFromHeight(leftHeight, this.register)
    }

    const identity =
      degree === null ? null : { degree, major, octave: this.register }
    const expected =
      identity !== null &&
      this.target !== null &&
      identity.degree === this.target.degree &&
      identity.major === this.target.major
    const moving = liveLeft !== null && this.stable.left.motion(liveLeft) > STILL
    const hold = expected ? EXPECTED_HOLD_MS : moving ? MOVING_HOLD_MS : CHORD_HOLD_MS

    // Three cases, and they are deliberately distinct. A hand in view decides;
    // a hand in grace sustains only; a hand that is truly gone releases at once
    // rather than waiting out a hold that would keep sounding into an empty room.
    let committed: Identity | null
    if (liveLeft) {
      const key = `${identity?.degree}|${identity?.major}|${identity?.octave}`
      committed = this.identity.update(identity, identity && key, now, hold)
    } else if (left) {
      committed = this.identity.hold()
    } else {
      this.identity.release()
      committed = null
    }
    const sounding = this.held ?? committed

    const commitKey = committed && `${committed.degree}|${committed.major}`
    if (commitKey !== this.lastCommit) {
      this.lastCommit = commitKey
      if (committed) this.onCommit?.(committed.degree, committed.major, now - hold)
    }

    const wanted: Colour = { voicing: rightFingers ? voicingFromFingers(rightFingers) : 1 }
    const colour = this.colour.update(wanted, `${wanted.voicing}`, now) ?? wanted

    const chord = sounding && buildChord(key, { ...sounding, ...colour })
    const easedVolume = volume * Math.min(1, (now - this.startedAt) / EASE_IN_MS)
    if (chord) {
      this.synth.play(chord.freqs)
      this.synth.setVolume(easedVolume)
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
        // Only what the instrument actually reads can be wrong. The thumb is
        // not read on this hand, so a player resting with it out must still be
        // able to satisfy the pose.
        const reached = target.right.slice(1).every((up, i) => up === rightFingers[i + 1])
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

    this.describe(
      hands,
      liveLeft,
      liveRight,
      leftFingers ?? null,
      rightFingers ?? null,
      degree,
      resting,
      smoothedRoll,
      sounding,
    )

    return {
      name: chord?.name ?? null,
      numeral: chord?.numeral ?? null,
      quality: chord?.quality ?? null,
      octave: chord?.octave ?? 0,
      handHeight: leftHeight,
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
        volume: this.reach(this.stable.right.height(right.height)),
        tilt: this.stable.right.tilt(right.tilt),
      }
    }
    if (left) return { volume: leftHeight, tilt: 0 }
    return { volume: 0.5, tilt: 0 }
  }

  /**
   * Collects a calibration sample, but only from a frame worth trusting: a hand
   * that is actually in view, confident, holding a recognised pose, and still.
   * A sample taken mid-move measures the move, not the hold.
   */
  /** Frame height mapped onto the range this player actually uses. */
  private reach(height: number): number {
    return this.calibration ? reachTo01(height, this.calibration.reach) : height
  }

  private sample(live: HandState | null, degree: number | null, now: number): void {
    const cal = this.cal
    if (!cal || now < cal.settleUntil) return
    const step = STEPS[cal.index]
    if (!step || !live) return
    // A sample taken mid-move measures the move, not the hold.
    if (this.stable.left.motion(live) > STILL) return

    const value = step.sample(live, degree)
    if (value === null) return

    const bucket = (cal.samples[step.id] ??= [])
    bucket.push(value)
    if (bucket.length < CALIBRATION_FRAMES) return

    cal.index++
    if (cal.index < STEPS.length) {
      // A beat to change pose, so changing it is never mistaken for the pose.
      cal.settleUntil = now + CALIBRATION_SETTLE_MS
      cal.onStep(STEPS[cal.index])
      return
    }

    const result = derive(cal.samples)
    if ('calibration' in result) this.setCalibration(result.calibration)
    this.cal = null
    cal.onStep(null)
    cal.onDone(result)
  }

  /** Dev-only: raw features plus the latency budget, for tuning against real play. */
  /**
   * Records what the instrument currently believes, in its own terms, so a
   * fault can be read off the screen instead of inferred from how it sounded.
   */
  private describe(
    hands: HandState[],
    liveLeft: HandState | null,
    liveRight: HandState | null,
    leftFingers: Fingers | null,
    rightFingers: Fingers | null,
    degree: number | null,
    resting: boolean,
    smoothedRoll: number | null,
    sounding: Identity | null,
  ): void {
    const band = this.calibration?.thumb ?? { on: THUMB_ON, off: THUMB_OFF }
    const reason = this.held
      ? 'held'
      : hands.length === 0
        ? 'no hands'
        : !liveLeft
          ? 'chord hand out of frame'
          : resting
            ? 'resting'
            : degree === null
              ? 'pose not recognised'
              : sounding
                ? 'playing'
                : 'settling'

    this.diag = {
      reason,
      fingers: { left: leftFingers, right: rightFingers },
      degree,
      lean:
        smoothedRoll === null
          ? null
          : {
              value: leanOf(smoothedRoll, degree, this.lean.offset),
              engage: this.lean.on,
              release: this.lean.off,
              leaned: this.leaned,
            },
      register: this.register,
      thumb: {
        left: liveLeft ? thumbSignal(liveLeft) : null,
        right: liveRight ? thumbSignal(liveRight) : null,
        on: band.on,
        off: band.off,
      },
      fps: this.diag.fps,
    }
  }

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
    a.octave === b.octave &&
    Math.round(a.handHeight * 40) === Math.round(b.handHeight * 40) &&
    a.filter === b.filter &&
    a.volume === b.volume &&
    a.hands === b.hands &&
    a.latched === b.latched
  )
}
