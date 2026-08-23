import { neutralRollFor, type LeanCalibration } from './chords.ts'
import { thumbSignal } from './classifier.ts'
import type { HandState } from './features.ts'

/**
 * What the instrument measures about a particular pair of hands.
 *
 * Every constant here started as one person's, measured in one sitting, and
 * each one has since been wrong for somebody: an upright hand reading as
 * leaned, a register boundary sitting above where a player can comfortably
 * reach, a thumb threshold placed for a hand that is not theirs. Calibration
 * replaces judgement with measurement for all of them.
 */
export const CALIBRATION_VERSION = 2

export interface Calibration {
  version: number
  lean: LeanCalibration
  /** The band of frame height this player actually uses, lowest to highest. */
  reach: { low: number; high: number }
  /** Where this player's thumb sits folded and extended. */
  thumb: { on: number; off: number }
}

export type StepId = 'upright' | 'leaned' | 'low' | 'high' | 'thumbIn' | 'thumbOut'

export interface Step {
  id: StepId
  title: string
  hint: string
  /** The single number this step is measuring, or null if the frame is unusable. */
  sample: (hand: HandState, degree: number | null) => number | null
}

const needsPose = (hand: HandState, degree: number | null, value: number) =>
  degree === null ? null : value

export const STEPS: Step[] = [
  {
    id: 'upright',
    title: 'Hold upright',
    hint: 'Any chord shape, held the way you naturally would',
    sample: (h, d) => needsPose(h, d, h.roll - neutralRollFor(d)),
  },
  {
    id: 'leaned',
    title: 'Now lean it',
    hint: 'As far as you would to reach for a minor chord',
    sample: (h, d) => needsPose(h, d, h.roll - neutralRollFor(d)),
  },
  {
    id: 'low',
    title: 'Hand low',
    hint: 'The quietest you would play',
    sample: (h) => h.height,
  },
  {
    id: 'high',
    title: 'Hand high',
    hint: 'The loudest you would play',
    sample: (h) => h.height,
  },
  {
    id: 'thumbIn',
    title: 'Thumb tucked',
    hint: 'One finger up, thumb folded in',
    sample: (h) => thumbSignal(h),
  },
  {
    id: 'thumbOut',
    title: 'Thumb out',
    hint: 'Same hand, thumb held away',
    sample: (h) => thumbSignal(h),
  },
]

export type Samples = Partial<Record<StepId, number[]>>

/** Median, because one twitch inside a two-second hold should not decide anything. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export interface Problem {
  step: StepId
  reason: string
}

/**
 * Turns held samples into a calibration, or explains why it cannot. Refusing is
 * a feature: a calibration derived from two indistinguishable holds is worse
 * than the defaults, because it looks measured.
 */
export function derive(samples: Samples): { calibration: Calibration } | { problems: Problem[] } {
  const problems: Problem[] = []
  const at = (id: StepId) => {
    const values = samples[id]
    if (!values || values.length < 15) {
      problems.push({ step: id, reason: 'not enough steady frames' })
      return 0
    }
    return median(values)
  }

  const upright = at('upright')
  const leaned = at('leaned')
  const low = at('low')
  const high = at('high')
  const thumbIn = at('thumbIn')
  const thumbOut = at('thumbOut')
  if (problems.length) return { problems }

  const travel = leaned - upright
  if (travel > -0.05) {
    problems.push({ step: 'leaned', reason: 'the lean was too close to upright to tell apart' })
  }
  if (high - low < 0.15) {
    problems.push({ step: 'high', reason: 'the two hand heights were too close together' })
  }
  const gap = thumbOut - thumbIn
  if (gap < 0.06) {
    problems.push({ step: 'thumbOut', reason: 'the thumb positions were too close to tell apart' })
  }
  if (problems.length) return { problems }

  return {
    calibration: {
      version: CALIBRATION_VERSION,
      // Thresholds sit between the two measured holds, scaled to the distance
      // between them, so a small lean and a theatrical one both work.
      lean: { offset: upright, on: travel * 0.55, off: travel * 0.28 },
      reach: { low, high },
      // Biased toward the folded reading: a spurious thumb shifts every degree,
      // while a missed one costs only degrees V and VII.
      thumb: { on: thumbIn + gap * 0.6, off: thumbIn + gap * 0.35 },
    },
  }
}

/** Rejects anything not shaped like a calibration, including older versions. */
export function isValid(value: unknown): value is Calibration {
  const c = value as Calibration | null
  if (!c || c.version !== CALIBRATION_VERSION) return false
  const numbers = [
    c.lean?.offset, c.lean?.on, c.lean?.off,
    c.reach?.low, c.reach?.high,
    c.thumb?.on, c.thumb?.off,
  ]
  return numbers.every((n) => typeof n === 'number' && Number.isFinite(n))
}

/** Maps a raw frame height onto the range this player actually reaches. */
export function reachTo01(height: number, reach: Calibration['reach']): number {
  const span = reach.high - reach.low
  if (span <= 0) return height
  return Math.min(1, Math.max(0, (height - reach.low) / span))
}
