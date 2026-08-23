import dataset from './fixtures/gestures.json'
import { measure, replay, stitch, type Metrics } from './session'
import type { Point3, Side } from './features'

/**
 * Replays a session through the real engine and reports how steady it was.
 *
 * The bar is not "does it pick the right chord" — the unit tests cover that
 * from held poses. It is "does it stay put", which is the property that has
 * actually been failing and which held poses cannot measure.
 */

interface Sample {
  label: string
  side: Side
  trusted?: boolean
  frames: Point3[][]
}

/** Poses in the order a player might actually move between them. */
const ORDER = ['one', 'two', 'three', 'four', 'five', 'four', 'three', 'two', 'one']

export interface ReplayReport {
  metrics: Metrics
  /** One change per intended pose change is the ideal; more are chords in transit. */
  intended: number
  spurious: number
  passed: boolean
}

export function runReplayCheck(): ReplayReport {
  const samples = (dataset as { samples: Sample[] }).samples.filter(
    (s) => s.side === 'left' && s.trusted !== false,
  )
  const byLabel = new Map(samples.map((s) => [s.label, s]))

  const poses = ORDER.map((label) => byLabel.get(label))
    .filter((s): s is Sample => Boolean(s))
    // The middle frame of a take is the most settled part of it.
    .map((s) => ({ side: s.side, landmarks: s.frames[Math.floor(s.frames.length / 2)] }))

  const session = stitch(poses)
  const metrics = measure(replay(session))

  // Each pose change should produce exactly one chord change. Transitions pass
  // through intermediate finger counts, and any chord sounded on the way is a
  // chord the player did not ask for.
  const intended = poses.length - 1
  const spurious = Math.max(0, metrics.changes - intended - 1)

  return { metrics, intended, spurious, passed: spurious === 0 }
}
