/**
 * Hand geometry: landmarks in, features out. Deliberately free of any tracker,
 * camera or browser dependency, so recorded landmarks can be replayed through
 * exactly the code the instrument runs — which is what makes a regression suite
 * of real hands possible at all.
 */

export type Side = 'left' | 'right'
export type Point = { x: number; y: number }
export type Point3 = { x: number; y: number; z: number }
/** [thumb, index, middle, ring, pinky] */
export type Fingers = [boolean, boolean, boolean, boolean, boolean]
/** Per-digit straightness: 0 fully curled, 1 fully straight. */
export type Extension = [number, number, number, number, number]

/**
 * Candidate thumb measurements, all recorded so the choice between them can be
 * made from labelled data rather than intuition. Two previous thumb features
 * were each chosen from a handful of frames and each failed on a pose those
 * frames did not contain.
 */
export interface ThumbFeatures {
  /** Angle of the thumb away from the palm axis. */
  abduction: number
  /** Tip to index knuckle, in palm widths. */
  toIndex: number
  /** Tip to pinky knuckle, in palm widths. */
  toPinky: number
  /** Signed offset from the palm axis; negative means across the palm. */
  lateral: number
}

export interface HandState {
  side: Side
  /** 21 landmarks in mirrored display space: x/y in 0..1, origin top-left. */
  points: Point[]
  /** Landmarks exactly as the tracker reported them, depth included. Recordings
   *  keep these so features can be redesigned without recapturing. */
  raw: Point3[]
  extension: Extension
  thumb: ThumbFeatures
  /** How open the hand is overall — fingertip spread in palm widths. */
  spread: number
  /** MediaPipe's own confidence that this is a hand of the reported side. */
  confidence: number
  /** Roll in radians: 0 = pointing straight up, + = leaning right on screen. */
  roll: number
  /** -1..1 with a dead zone at rest; negative = rolled inward. */
  tilt: number
  /** 0 at the bottom of the frame, 1 at the top. */
  height: number
  /**
   * Whether the palm itself is inside the frame. Landmarks are extrapolated
   * beyond the edges, so a hand sliding out of shot keeps producing poses —
   * garbage ones — right up until it disappears.
   */
  inFrame: boolean
}

const WRIST = 0
const MIDDLE_MCP = 9
const RING_MCP = 13
const INDEX_MCP = 5
const PINKY_MCP = 17
/** Joint chains per digit, knuckle outward. */
const CHAINS: number[][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]
const TIPS = [4, 8, 12, 16, 20]

/** How far the wrist must travel past the knuckles to reach full deflection. */
const MAX_TRAVEL = 0.12
/** Frame band the wrist sweeps to go from silent to full volume. */
const VOLUME_TOP = 0.05
const VOLUME_BOTTOM = 0.95


/**
 * Landmarks to features, with no dependency on the tracker, the camera or the
 * browser. Recorded landmarks can therefore be replayed through exactly the code
 * the instrument runs — which is what makes a regression suite of real hands
 * possible at all.
 */
export function describeLandmarks(
  landmarks: { x: number; y: number; z?: number }[],
  side: Side,
  confidence = 1,
): HandState {
  // Mirror x so the maths matches what the player sees on screen.
  const points = landmarks.map((p) => ({ x: 1 - p.x, y: p.y }))
  const solid = landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z ?? 0 }))

  return {
    side,
    points,
    raw: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
    extension: readExtension(solid),
    thumb: readThumb(solid),
    spread: readSpread(solid),
    confidence,
    roll: readRoll(points),
    tilt: readTilt(points),
    height: clamp01((VOLUME_BOTTOM - points[WRIST].y) / (VOLUME_BOTTOM - VOLUME_TOP)),
    inFrame: [WRIST, INDEX_MCP, PINKY_MCP].every((i) => inside(points[i])),
  }
}

/**
 * Straightness from joint angles rather than distance ratios. An angle is
 * invariant to where the hand is, how big it is and how it is rotated — none of
 * which was true of the distances this replaces, and each of which was a way for
 * the classifier to be wrong about a pose it had never been measured on.
 */
function readExtension(p: Point3[]): Extension {
  return CHAINS.map((chain) => {
    // Bend at the two outer joints; the knuckle is excluded because a splayed
    // hand bends there without curling.
    const bend = bendAngle(p[chain[0]], p[chain[1]], p[chain[2]]) + bendAngle(p[chain[1]], p[chain[2]], p[chain[3]])
    return clamp01(1 - bend / Math.PI)
  }) as Extension
}

function readThumb(p: Point3[]): ThumbFeatures {
  const palm = distance(p[WRIST], p[MIDDLE_MCP]) || 1e-6
  const axis = subtract(p[MIDDLE_MCP], p[WRIST])
  const thumbDirection = subtract(p[4], p[2])
  const across = subtract(p[INDEX_MCP], p[PINKY_MCP])

  return {
    abduction: angleBetween(thumbDirection, axis),
    toIndex: distance(p[4], p[INDEX_MCP]) / palm,
    toPinky: distance(p[4], p[PINKY_MCP]) / palm,
    lateral: dot(subtract(p[4], p[WRIST]), across) / (magnitude(across) * palm || 1e-6),
  }
}

/** Mean fingertip separation: high for an open hand, near zero for a fist. */
function readSpread(p: Point3[]): number {
  const palm = distance(p[WRIST], p[MIDDLE_MCP]) || 1e-6
  let total = 0
  let pairs = 0
  for (let a = 1; a < TIPS.length; a++) {
    for (let b = a + 1; b < TIPS.length; b++) {
      total += distance(p[TIPS[a]], p[TIPS[b]])
      pairs++
    }
  }
  return total / pairs / palm
}

/**
 * Tilt is not an angle. It asks where the wrist sits relative to the x-span
 * between the middle and ring knuckles: inside that span reads as exactly zero,
 * which gives a dead zone for free — a hand held normally registers nothing, and
 * the control only engages on a deliberate roll of the wrist.
 *
 * Sign convention: negative is rolled inward. If the filter sweeps the wrong
 * way, negate here rather than at the call sites.
 */
function readTilt(p: Point[]): number {
  const min = Math.min(p[MIDDLE_MCP].x, p[RING_MCP].x)
  const max = Math.max(p[MIDDLE_MCP].x, p[RING_MCP].x)
  const wrist = p[WRIST].x
  const overshoot = wrist < min ? wrist - min : wrist > max ? wrist - max : 0
  return -Math.max(-1, Math.min(1, overshoot / MAX_TRAVEL))
}

function readRoll(p: Point[]): number {
  const dx = p[MIDDLE_MCP].x - p[WRIST].x
  const dy = p[MIDDLE_MCP].y - p[WRIST].y
  return Math.atan2(dx, -dy)
}

/** How far the joint at `b` is bent away from straight, in radians. */
function bendAngle(a: Point3, b: Point3, c: Point3): number {
  return Math.PI - angleBetween(subtract(a, b), subtract(c, b))
}

function angleBetween(u: Point3, v: Point3): number {
  const scale = magnitude(u) * magnitude(v) || 1e-6
  return Math.acos(Math.min(1, Math.max(-1, dot(u, v) / scale)))
}

function subtract(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function magnitude(v: Point3): number {
  return Math.hypot(v.x, v.y, v.z)
}

function distance(a: Point3, b: Point3): number {
  return magnitude(subtract(a, b))
}

/** A little tolerance, so a hand at the very edge still counts as present. */
function inside(p: Point): boolean {
  return p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
