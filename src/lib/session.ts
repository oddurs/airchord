import { KEYS, type Key } from './chords'
import { Engine } from './engine'
import { describeLandmarks, type Point3, type Side } from './features'

/**
 * A recorded stretch of playing, and what the instrument decides when it is
 * replayed.
 *
 * The captured gesture dataset is *held poses*. Playing is transitions, drift,
 * hands leaving frame and hands doing nothing in particular — none of which is
 * in it, and all of which is where the faults have been. A session is the
 * missing half: it can be replayed through the real engine, so a gesture change
 * can be judged before anybody plays it.
 */
export const SESSION_VERSION = 1

export interface SessionFrame {
  /** Milliseconds since the session started. */
  t: number
  hands: { side: Side; landmarks: Point3[] }[]
}

export interface Session {
  version: number
  recorded: string
  /** What the player was in, so a replay reaches the same chords. */
  key: string
  frames: SessionFrame[]
  /** Optional ground truth: when the player intended a change. */
  marks?: { t: number; note: string }[]
}

export interface Decision {
  t: number
  chord: string | null
  reason: string
}

export interface Metrics {
  frames: number
  seconds: number
  /** Times the sounding chord changed. */
  changes: number
  /** Changes per minute — the number that says whether it is steady. */
  changesPerMinute: number
  /** Longest unbroken stretch of one chord, in seconds. */
  longestHold: number
  /** Times it fell silent after having been playing. */
  dropouts: number
  reasons: Record<string, number>
}

/** Replays a session through the real engine, with nothing drawn and nothing heard. */
export function replay(session: Session): Decision[] {
  const key: Key = KEYS.find((k) => k.name === session.key) ?? KEYS[0]
  const engine = new Engine(null)
  const decisions: Decision[] = []

  for (const frame of session.frames) {
    const hands = frame.hands.map((h) => describeLandmarks(h.landmarks, h.side))
    const hud = engine.frame({ hands, video: null, key, now: frame.t, inferenceMs: 0 })
    decisions.push({
      t: frame.t,
      chord: hud.name === null ? null : `${hud.name} ${hud.quality}`,
      reason: engine.diagnostics.reason,
    })
  }
  engine.dispose()
  return decisions
}

export function measure(decisions: Decision[]): Metrics {
  const reasons: Record<string, number> = {}
  let changes = 0
  let dropouts = 0
  let longestHold = 0
  let holdStart = decisions[0]?.t ?? 0
  let previous: string | null | undefined

  for (const d of decisions) {
    reasons[d.reason] = (reasons[d.reason] ?? 0) + 1
    if (previous !== undefined && d.chord !== previous) {
      changes++
      if (previous !== null && d.chord === null) dropouts++
      longestHold = Math.max(longestHold, (d.t - holdStart) / 1000)
      holdStart = d.t
    }
    previous = d.chord
  }

  const last = decisions[decisions.length - 1]
  const seconds = last ? (last.t - decisions[0].t) / 1000 : 0
  longestHold = Math.max(longestHold, last ? (last.t - holdStart) / 1000 : 0)

  return {
    frames: decisions.length,
    seconds: Number(seconds.toFixed(2)),
    changes,
    changesPerMinute: seconds > 0 ? Number(((changes / seconds) * 60).toFixed(1)) : 0,
    longestHold: Number(longestHold.toFixed(2)),
    dropouts,
    reasons,
  }
}

/**
 * Builds a session out of held poses by moving between them.
 *
 * Honestly synthetic: a straight line between two hand shapes is not how a hand
 * travels. But it produces the one thing held poses cannot — transitions — and
 * a classifier that fires chords on the way between two poses will do it here
 * too. Real recordings replace this; until then it is far better than nothing.
 */
export function stitch(
  poses: { landmarks: Point3[]; side: Side }[],
  options: { holdFrames?: number; moveFrames?: number; fps?: number } = {},
): Session {
  const hold = options.holdFrames ?? 30
  const move = options.moveFrames ?? 8
  const step = 1000 / (options.fps ?? 30)
  const frames: SessionFrame[] = []
  const marks: { t: number; note: string }[] = []

  poses.forEach((pose, index) => {
    if (index > 0) {
      const from = poses[index - 1].landmarks
      for (let i = 1; i <= move; i++) {
        const k = i / (move + 1)
        frames.push({
          t: frames.length * step,
          hands: [
            {
              side: pose.side,
              landmarks: pose.landmarks.map((p, j) => ({
                x: from[j].x + (p.x - from[j].x) * k,
                y: from[j].y + (p.y - from[j].y) * k,
                z: from[j].z + (p.z - from[j].z) * k,
              })),
            },
          ],
        })
      }
    }
    marks.push({ t: frames.length * step, note: `pose ${index}` })
    for (let i = 0; i < hold; i++) {
      frames.push({ t: frames.length * step, hands: [{ side: pose.side, landmarks: pose.landmarks }] })
    }
  })

  return { version: SESSION_VERSION, recorded: 'synthetic', key: 'E', frames, marks }
}
