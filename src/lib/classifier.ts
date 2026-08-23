import { Latch } from './smoothing.ts'
import type { Fingers, HandState } from './features.ts'

/**
 * Straightness, 0 curled to 1 straight. Measured across the captured dataset:
 * curled fingers land at 0.02-0.34 and extended ones at 0.88-0.97, so the band
 * sits in the middle of a wide, clean gap. This is the healthiest signal in the
 * classifier.
 */
export const FINGER_ON = 0.7
export const FINGER_OFF = 0.55

/**
 * Chosen from the captured dataset rather than from intuition. Across real poses
 * the thumb tip sits 0.14-0.23 palm widths from the index knuckle when folded in
 * and 0.34-0.83 when out, so the band goes in that gap.
 *
 * The margin either side is only about 0.04, which is thinner than it should be.
 * More capture sessions — other distances, other light, other hands — are what
 * widens it. Until then this is the narrowest part of the classifier.
 */
export const THUMB_ON = 0.28
export const THUMB_OFF = 0.25
/**
 * Consecutive frames the thumb must read as out before it counts.
 *
 * Its distributions overlap frame to frame — a folded thumb spikes to 0.47 and
 * an extended one dips to 0.24 — so no threshold separates them, and neither
 * smoothing nor a median helps: both were measured and both made it worse, the
 * first through lag and the second because the spikes come in clusters. What
 * works is refusing to engage on a spike while still releasing instantly.
 */
export const THUMB_ENGAGE_FRAMES = 3

/** Below this, MediaPipe is not confident enough to drive an instrument. */
export const CONFIDENCE_FLOOR = 0.6

/**
 * Distance from the thumb tip to the index knuckle, and nothing else.
 *
 * Straightness is deliberately not part of this. The dataset shows a thumb is
 * nearly always straight — 0.69-0.92 when out, 0.66-0.94 when in — so curl
 * carries almost no information about a thumb. What changes is where it points.
 *
 * The previous rule multiplied straightness by a rescaled distance whose offset
 * put every real thumb-out value at zero, which is why the thumb was never
 * detected at all.
 */
export function thumbSignal(hand: HandState): number {
  return hand.thumb.toIndex
}

/** Per-digit latches, so a measurement resting on a threshold stops flickering. */
export class FingerClassifier {
  private latches = [
    new Latch(THUMB_ON, THUMB_OFF, false, THUMB_ENGAGE_FRAMES),
    new Latch(FINGER_ON, FINGER_OFF),
    new Latch(FINGER_ON, FINGER_OFF),
    new Latch(FINGER_ON, FINGER_OFF),
    new Latch(FINGER_ON, FINGER_OFF),
  ]

  update(hand: HandState): Fingers {
    const signals = [thumbSignal(hand), ...hand.extension.slice(1)]
    return this.latches.map((latch, i) => latch.update(signals[i])) as Fingers
  }
}

/**
 * Register from the height of the chord hand.
 *
 * The octave used to ride the right thumb, which is the least reliable
 * measurement in the instrument — roughly 0.04 of margin either side, against
 * 0.5 for every other finger. Putting the most drastic musical change on the
 * shakiest input was the design error, not the tuning.
 *
 * Height is stable, continuous, visible, and means something before it is
 * learned: lift the chord hand to lift the chord. It is also otherwise unused
 * while both hands are up.
 *
 * Boundaries overlap by GUARD so a hand drifting near one holds its register
 * rather than flickering across it.
 */
export const REGISTER_LOW = 0.34
export const REGISTER_HIGH = 0.66
const GUARD = 0.05

/** -1 an octave down, 0 as written, +1 an octave up. */
export function registerFromHeight(height: number, previous: number): number {
  const settled = (lower: number, upper: number) => height >= lower && height <= upper
  // Staying put needs only to remain loosely within the current band; leaving
  // it needs to clear the guard.
  if (previous === -1 && height < REGISTER_LOW + GUARD) return -1
  if (previous === 1 && height > REGISTER_HIGH - GUARD) return 1
  if (previous === 0 && settled(REGISTER_LOW - GUARD, REGISTER_HIGH + GUARD)) return 0
  if (height < REGISTER_LOW) return -1
  if (height > REGISTER_HIGH) return 1
  return 0
}
