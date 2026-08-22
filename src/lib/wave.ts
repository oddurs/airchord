/**
 * The energy wave. Every channel of it is mapped to something the player is
 * doing: hue is the scale degree, brightness is major versus minor, the number
 * of stacked lines is the right-hand voicing, thickness is volume, and the
 * jitter riding on the sine is tilt. Nothing here is decorative.
 *
 * Shared by the instrument overlay and the landing page, so the first thing
 * anyone sees is the real thing rather than an impression of it.
 */

/** One hue per scale degree, so the wave tells you where you are in the key. */
export const DEGREE_HUES: Record<number, string> = {
  1: '232, 161, 61',
  2: '210, 50, 120',
  3: '180, 40, 150',
  4: '240, 210, 40',
  5: '245, 120, 30',
  6: '230, 40, 40',
  7: '100, 200, 250',
}

export interface WaveSpec {
  degree: number
  major: boolean
  /** Right-hand fingers, 0-4. Zero draws nothing. */
  voices: number
  volume: number
  tilt: number
  now: number
  /** Vertical centre, in device pixels. */
  centreY: number
  /** Device pixels per CSS pixel, so the layout constants stay honest. */
  scale: number
  /** Overall opacity, for contexts that want the wave to sit back. */
  alpha?: number
}

export function paintWave(ctx: CanvasRenderingContext2D, spec: WaveSpec): void {
  const { degree, major, voices, volume, tilt, now, centreY, scale } = spec
  if (voices < 1) return

  const width = ctx.canvas.width
  const maxThickness = (1 + volume * 8) * scale
  const chaos = (tilt + 1) / 2
  const jitterAmp = chaos * 25 * scale
  const jitterFreq = (0.05 + chaos * 0.15) / scale
  const time = now * 0.004
  const hue = DEGREE_HUES[degree] ?? DEGREE_HUES[1]

  ctx.save()
  ctx.globalAlpha = (major ? 1 : 0.7) * (spec.alpha ?? 1)
  ctx.strokeStyle = `rgb(${hue})`
  ctx.shadowColor = `rgb(${hue})`
  ctx.shadowBlur = 12 * scale

  for (let line = 0; line < voices; line++) {
    const y0 = centreY + (line - (voices - 1) / 2) * 12 * scale
    ctx.lineWidth = Math.max(1, maxThickness - line * 0.5 * scale)
    ctx.beginPath()
    for (let x = 0; x <= width; x += 2 * scale) {
      const sway = Math.sin((x * 0.005) / scale + time + line * 0.5) * 20 * scale
      const jitter = Math.sin(x * jitterFreq + time * 3) * jitterAmp
      const y = y0 + sway + jitter
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}
