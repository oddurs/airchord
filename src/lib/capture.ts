import type { Fingers, HandState, Point3, Side } from './features.ts'

/**
 * The gesture vocabulary *and its negative space*. The negative poses matter
 * most: every accuracy failure so far has been a pose the reference frames did
 * not contain, and all four of those frames had an extended index finger.
 */
export interface Pose {
  id: string
  title: string
  hint: string
  expected: Fingers
}

const F = false
const T = true

export const POSES: Pose[] = [
  { id: 'fist', title: 'Fist', hint: 'Closed, thumb across the fingers', expected: [F, F, F, F, F] },
  { id: 'relaxed', title: 'Relaxed', hint: 'Hand loose, not holding a shape', expected: [F, F, F, F, F] },
  { id: 'thumb-only', title: 'Thumbs up', hint: 'Thumb only', expected: [T, F, F, F, F] },
  { id: 'one', title: 'One', hint: 'Index only', expected: [F, T, F, F, F] },
  { id: 'two', title: 'Two', hint: 'Index and middle', expected: [F, T, T, F, F] },
  { id: 'three', title: 'Three', hint: 'Index, middle, ring', expected: [F, T, T, T, F] },
  { id: 'four', title: 'Four', hint: 'All but the thumb', expected: [F, T, T, T, T] },
  { id: 'five', title: 'Five', hint: 'Open hand, thumb out', expected: [T, T, T, T, T] },
  { id: 'horns', title: 'Horns', hint: 'Index and pinky, thumb in', expected: [F, T, F, F, T] },
  { id: 'ily', title: 'ILY', hint: 'Index, pinky and thumb', expected: [T, T, F, F, T] },
  { id: 'point-thumb', title: 'Point + thumb', hint: 'Index and thumb, an L', expected: [T, T, F, F, F] },
]

export interface Sample {
  label: string
  side: Side
  expected: Fingers
  /**
   * False when the label is known not to describe this hand — the first capture
   * tool recorded both hands under one pose label, so the hand that was resting
   * got labelled with the pose the other hand was making. Kept rather than
   * deleted: it is honest data about a resting hand, just not about the pose.
   */
  trusted?: boolean
  /** Landmarks as the tracker reported them, so features can be redesigned
   *  without recapturing. Replay goes through the same path as a live frame. */
  frames: Point3[][]
}

export interface Dataset {
  version: number
  captured: string
  samples: Sample[]
}

const FRAMES_PER_TAKE = 45
/** Short takes are still usable; anything below this is noise, not a sample. */
const MIN_FRAMES = 18
/** No take may hang. Measured from the first frame that actually had a hand. */
const TAKE_TIMEOUT_MS = 8000
/** How long to wait for hands to arrive before giving up on a take. */
const ARM_TIMEOUT_MS = 20000

/**
 * Records a few seconds of landmarks against a label. Landmarks rather than
 * features: the features are the part most likely to be redesigned, and a
 * dataset that has to be recaptured every time is a dataset nobody recaptures.
 */
export interface Progress {
  /** Frames gathered for the best-covered hand. */
  captured: number
  target: number
  hands: number
  /** True once hands have arrived and frames are actually being kept. */
  recording: boolean
  done: boolean
  /** Set when a take ended with nothing usable. */
  failed?: string
}

export class CaptureSession {
  private samples: Sample[] = []
  private recording: {
    pose: Pose
    side: Side
    buffers: Map<Side, Sample>
    armedAt: number
    /** Null until a hand is actually in view; the clock starts then, not on click. */
    startedAt: number | null
  } | null = null

  get counts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const sample of this.samples) counts[sample.label] = (counts[sample.label] ?? 0) + 1
    return counts
  }

  get total(): number {
    return this.samples.length
  }

  get active(): string | null {
    return this.recording?.pose.id ?? null
  }

  /**
   * One hand per take. The first version recorded both and gave them the same
   * pose label, so the hand resting on the keyboard was labelled with the pose
   * the other hand was making — a third of the first dataset was wrong.
   */
  begin(pose: Pose, now: number, side: Side): void {
    this.recording = { pose, side, buffers: new Map(), armedAt: now, startedAt: null }
  }

  /**
   * A take finishes when the best-covered hand has enough frames — not when
   * every hand does. Requiring all of them meant a single spurious frame from a
   * second hand created a buffer that never filled, so the take never ended and
   * the tool locked up with nothing recorded.
   */
  accept(all: HandState[], now: number): Progress {
    const take = this.recording
    if (!take) {
      return { captured: 0, target: FRAMES_PER_TAKE, hands: 0, recording: false, done: false }
    }
    const hands = all.filter((h) => h.side === take.side)

    // Nothing is recorded until hands are actually in view. You start a take by
    // clicking a button, which means your hand is on the mouse and not in the
    // camera — waiting is the difference between a take that works and one that
    // quietly captures nothing.
    if (take.startedAt === null) {
      if (hands.length === 0) {
        const expired = now - take.armedAt > ARM_TIMEOUT_MS
        if (expired) this.recording = null
        return {
          captured: 0,
          target: FRAMES_PER_TAKE,
          hands: 0,
          recording: false,
          done: expired,
          failed: expired ? 'No hands appeared — try again' : undefined,
        }
      }
      take.startedAt = now
    }

    for (const hand of hands) {
      let sample = take.buffers.get(hand.side)
      if (!sample) {
        sample = { label: take.pose.id, side: hand.side, expected: take.pose.expected, frames: [] }
        take.buffers.set(hand.side, sample)
      }
      if (sample.frames.length < FRAMES_PER_TAKE) sample.frames.push(hand.raw)
    }

    const buffers = [...take.buffers.values()]
    const captured = Math.max(0, ...buffers.map((s) => s.frames.length))
    const expired = now - take.startedAt > TAKE_TIMEOUT_MS
    const done = captured >= FRAMES_PER_TAKE || expired
    if (!done) {
      return { captured, target: FRAMES_PER_TAKE, hands: buffers.length, recording: true, done: false }
    }

    // Keep every hand that gathered enough to be worth having; drop the rest.
    const usable = buffers.filter((s) => s.frames.length >= MIN_FRAMES)
    this.samples.push(...usable)
    this.recording = null
    return {
      captured,
      target: FRAMES_PER_TAKE,
      hands: usable.length,
      recording: false,
      done: true,
      failed: usable.length === 0 ? 'No hand stayed in view — try again' : undefined,
    }
  }

  cancel(): void {
    this.recording = null
  }

  toDataset(): Dataset {
    return { version: 1, captured: new Date().toISOString(), samples: this.samples }
  }
}
