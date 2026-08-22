import type { Fingers, Point, Side } from '@/lib/features'
import { CONNECTIONS, DIAL, TIPS, dialArc, frameFacing, handTemplate, place } from '@/lib/pose'

/**
 * A hand, drawn from exactly the geometry the overlay draws on yours. The ghost
 * on your hand and the picture beside the chord are one template rendered twice,
 * so a diagram can never teach a pose the instrument does not read.
 */

interface Props {
  fingers: Fingers
  side: Side
  /** Present on the chord hand only: which way the wrist has to go. */
  lean?: 'major' | 'minor'
  /** Palm length in pixels — the diagram sizes itself around it. */
  size: number
}

/** Illustrative, not measured. The real decision is a couple of degrees either
 *  side of vertical, which is legible as a dial and invisible as a drawing. */
const TILT = 13
const PAD = 5
/** Below about this, a stroke stops being a line and starts being a smudge. */
const MIN_STROKE = 1.2

const path = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

const stroke = (size: number, ratio: number) => Math.max(MIN_STROKE, size * ratio)

export default function HandDiagram({ fingers, side, lean, size }: Props) {
  const tilt = lean === 'major' ? TILT : lean === 'minor' ? -TILT : 0
  const points = place(handTemplate(fingers), frameFacing(side, tilt, size, { x: 0, y: 0 }))

  const radius = size * DIAL.radius
  const dial = lean
    ? {
        track: dialArc(-DIAL.span, DIAL.span, radius),
        lit:
          lean === 'major'
            ? dialArc(DIAL.gear * 0.045, DIAL.span, radius)
            : dialArc(-DIAL.span, DIAL.gear * -0.07, radius),
      }
    : null

  const all = dial ? [...points, ...dial.track] : points
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const minX = Math.min(...xs) - PAD
  const minY = Math.min(...ys) - PAD
  const width = Math.max(...xs) - minX + PAD
  const height = Math.max(...ys) - minY + PAD

  return (
    <svg
      viewBox={`${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`}
      width={width.toFixed(1)}
      height={height.toFixed(1)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      {dial && (
        <>
          {/* The lit half has to win by weight, not by opacity: at this size a
              hairline at 0.9 and a hairline at 0.3 read as one grey arc. */}
          <path d={path(dial.track)} strokeWidth={stroke(size, 0.02)} opacity={0.28} />
          <path d={path(dial.lit)} strokeWidth={stroke(size, 0.075)} opacity={1} />
        </>
      )}
      {CONNECTIONS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={points[a].x.toFixed(1)}
          y1={points[a].y.toFixed(1)}
          x2={points[b].x.toFixed(1)}
          y2={points[b].y.toFixed(1)}
          strokeWidth={stroke(size, 0.034)}
        />
      ))}
      {TIPS.map((tip, digit) =>
        fingers[digit] ? (
          <circle key={tip} cx={points[tip].x.toFixed(1)} cy={points[tip].y.toFixed(1)} r={Math.max(2, size * 0.075)} strokeWidth={stroke(size, 0.024)} />
        ) : null,
      )}
    </svg>
  )
}
