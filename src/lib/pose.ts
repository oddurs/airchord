import type { Fingers, Point, Side } from './features.ts'

/**
 * The pose the instrument is asking for, and how to draw it on the player's own
 * hand. A chord name is useless mid-song; the mapping from name to hand shape is
 * the entire skill being learned, so the target is shown as a hand.
 */

export interface PoseTarget {
  degree: number
  major: boolean
  /** The chord hand: which degree, and which way the wrist has to lean. */
  fingers: Fingers
  /** The colour hand: voicing in the four fingers, octave in the thumb. */
  right: Fingers
}

/** The skeleton, and the tips worth ringing. Shared by everything that draws a
 *  hand — the canvas ghost and the diagrams in the lane are then the same
 *  geometry rendered twice, and cannot drift apart. */
export const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]

export const TIPS = [4, 8, 12, 16, 20]

/**
 * The lean dial. Major and minor are a zero crossing about a tenth of a radian
 * wide, so any drawing of it has to be geared up to be seen at all; `gear` is
 * that exaggeration, `span` how far the dial sweeps either side of straight
 * down, and `radius` its size in palm lengths. Shared, so the live dial on your
 * wrist and the one printed beside a chord are the same instrument.
 */
export const DIAL = { gear: 3.2, span: 0.95, radius: 0.62 }

/** The dial as a polyline, from one angle to another. Sampled rather than drawn
 *  as an arc: no sweep flags, no coordinate-system arguments, obviously right. */
export function dialArc(from: number, to: number, radius: number, steps = 12): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps
    return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius }
  })
}

/**
 * The inverse of `degreeFromFingers`. VI and VII are the two spread shapes; the
 * rest is a count, with the thumb joining in at five. Round-tripped in tests
 * against the classifier's own rule, so the two can never drift apart.
 */
export function fingersForDegree(degree: number): Fingers {
  switch (degree) {
    case 1: return [false, true, false, false, false]
    case 2: return [false, true, true, false, false]
    case 3: return [false, true, true, true, false]
    case 4: return [false, true, true, true, true]
    case 5: return [true, true, true, true, true]
    case 6: return [false, true, false, false, true]
    case 7: return [true, true, false, false, true]
    default: throw new Error(`No pose for degree ${degree}`)
  }
}

/** Right-hand pose: voicing in the four fingers, octave in the thumb. */
export function fingersForVoicing(voicing: number): Fingers {
  const raised = Math.min(4, Math.max(1, voicing))
  return [false, raised >= 1, raised >= 2, raised >= 3, raised >= 4]
}

/**
 * A hand's own frame: where the wrist is, how big the palm is, which way it
 * points, and which way is thumb-side. Deriving `across` from the player's own
 * index and pinky knuckles is what removes handedness from this file entirely —
 * a left hand and a right hand differ only in the sign of a vector they carry
 * with them, so a template placed in either frame comes out correct.
 */
const RADIANS = Math.PI / 180

export interface Frame {
  origin: Point
  up: Point
  across: Point
  scale: number
}

const WRIST = 0
const INDEX_MCP = 5
const MIDDLE_MCP = 9
const PINKY_MCP = 17

export function frameOf(points: Point[]): Frame {
  const origin = points[WRIST]
  const axis = { x: points[MIDDLE_MCP].x - origin.x, y: points[MIDDLE_MCP].y - origin.y }
  const scale = Math.hypot(axis.x, axis.y) || 1e-6
  const up = { x: axis.x / scale, y: axis.y / scale }

  // Orthogonalised against the palm axis, so a hand shown at an angle does not
  // put a skew into everything drawn in its frame.
  const span = { x: points[INDEX_MCP].x - points[PINKY_MCP].x, y: points[INDEX_MCP].y - points[PINKY_MCP].y }
  const along = span.x * up.x + span.y * up.y
  const perp = { x: span.x - up.x * along, y: span.y - up.y * along }
  const width = Math.hypot(perp.x, perp.y) || 1e-6

  return { origin, up, across: { x: perp.x / width, y: perp.y / width }, scale }
}

/**
 * A frame for a hand nobody is holding up: upright, mirrored per side the way
 * the camera shows it back to you, and tilted by the lean the chord needs. The
 * tilt is illustrative rather than measured — the real decision is a couple of
 * degrees either side of vertical, which is legible as a dial on your own wrist
 * and invisible as a drawing.
 */
export function frameFacing(side: Side, tilt: number, scale: number, origin: Point): Frame {
  const mirror = side === 'left' ? 1 : -1
  const angle = tilt * RADIANS
  return {
    origin,
    // Screen space: y grows downward, so "up" is negative.
    up: { x: Math.sin(angle), y: -Math.cos(angle) },
    across: { x: mirror * Math.cos(angle), y: mirror * Math.sin(angle) },
    scale,
  }
}

/** Template space: x across the palm toward the thumb, y along it, wrist at 0,
 *  middle knuckle at 1. Everything is in palm lengths, so it fits any hand. */
interface Digit {
  mcp: Point
  /** Degrees from the palm axis, positive toward the thumb side. */
  base: number
  lengths: [number, number, number]
}

const DIGITS: Digit[] = [
  { mcp: { x: 0.30, y: 0.22 }, base: 62, lengths: [0.30, 0.22, 0.18] },
  { mcp: { x: 0.34, y: 0.90 }, base: 10, lengths: [0.40, 0.25, 0.19] },
  { mcp: { x: 0.0, y: 1.0 }, base: 0, lengths: [0.44, 0.28, 0.20] },
  { mcp: { x: -0.3, y: 0.95 }, base: -10, lengths: [0.40, 0.26, 0.19] },
  { mcp: { x: -0.58, y: 0.82 }, base: -22, lengths: [0.32, 0.20, 0.17] },
]

/** A raised digit carries a little natural bend; a curled one folds over the
 *  palm and foreshortens, which is what a curled finger actually looks like
 *  from in front. Both fold *toward the palm centre*, so there is one rule for
 *  five digits rather than five tables of angles. */
const PALM_CENTRE: Point = { x: 0, y: 0.5 }
const EXTENDED_BEND = [0, 7, 9]
const CURLED_BEND = [0, 12, 12]
const CURLED_SCALE = 0.45

export function handTemplate(fingers: Fingers): Point[] {
  const points: Point[] = [{ x: 0, y: 0 }]

  DIGITS.forEach((digit, i) => {
    const up = fingers[i]
    const bends = up ? EXTENDED_BEND : CURLED_BEND
    let angle = up
      ? digit.base
      : Math.atan2(PALM_CENTRE.x - digit.mcp.x, PALM_CENTRE.y - digit.mcp.y) / RADIANS
    let point = digit.mcp
    points.push(point)

    for (let joint = 0; joint < 3; joint++) {
      angle += bends[joint]
      const length = digit.lengths[joint] * (up ? 1 : CURLED_SCALE)
      point = {
        x: point.x + Math.sin(angle * RADIANS) * length,
        y: point.y + Math.cos(angle * RADIANS) * length,
      }
      points.push(point)
    }
  })

  return points
}

/** Template into a hand's frame: same size, same angle, same side, same place. */
export function place(template: Point[], frame: Frame): Point[] {
  const { origin, up, across, scale } = frame
  return template.map((p) => ({
    x: origin.x + scale * (p.x * across.x + p.y * up.x),
    y: origin.y + scale * (p.x * across.y + p.y * up.y),
  }))
}
