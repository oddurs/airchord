/**
 * The energy band.
 *
 * It draws the *actual summed waveform of the sounding chord* — the pitches are
 * added as sines at their true frequency ratios, so the shape on screen is the
 * chord's own interference pattern. A root position and its first inversion are
 * the same notes and different waveforms, and they look different here for that
 * reason rather than because a parameter was varied to make them.
 *
 * Everything else is mapped too: hue is the scale degree, brightness is major
 * versus minor, amplitude is volume, and wrist tilt zooms the window so rolling
 * your hand pulls the waveform open or closed. Nothing is decorative.
 *
 * Shared by the instrument overlay and the landing page, so the first thing
 * anyone sees is the real thing.
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

/**
 * Periods of the fundamental across the width, before tilt zooms it. Enough
 * that the interference between the chord tones is visible as structure — at
 * two or three periods it just reads as a gentle curve.
 */
const BASE_CYCLES = 6
/** Horizontal resolution. Finer than this is invisible and costs frames. */
const STEP = 2

export interface WaveSpec {
  /** The sounding pitches. Their interference is literally what is drawn. */
  freqs: number[]
  degree: number
  major: boolean
  volume: number
  tilt: number
  now: number
  /** Vertical centre, in device pixels. */
  centreY: number
  /** Device pixels per CSS pixel, so the layout constants stay honest. */
  scale: number
  alpha?: number
  /**
   * Overrides for a context that is not reporting a performance.
   *
   * In the instrument every one of these is meaningful — the cycle count is the
   * chord's own period, the jitter is the wrist. On a landing page nobody is
   * playing, so the same settings read as agitation rather than as information.
   * The defaults are the instrument's; only the landing passes anything.
   */
  cycles?: number
  /** 0 removes the tilt-driven shimmer entirely. */
  jitter?: number
  /** Multiplies how fast the waveform travels. */
  speed?: number
}

export function paintWave(ctx: CanvasRenderingContext2D, spec: WaveSpec): void {
  const { freqs, degree, major, volume, tilt, now, centreY, scale } = spec
  if (freqs.length === 0 || volume <= 0.001) return

  const width = ctx.canvas.width
  const fundamental = Math.min(...freqs)
  const ratios = freqs.map((f) => f / fundamental)

  // Rolling the wrist opens and closes the window onto the waveform.
  const cycles = (spec.cycles ?? BASE_CYCLES) * Math.pow(1.6, -tilt)
  // Scroll at the chord's own rate, slowed to something the eye can follow.
  const phase = (now / 1000) * fundamental * 0.06 * (spec.speed ?? 1)

  const samples: number[] = []
  let peak = 0
  for (let x = 0; x <= width; x += STEP * scale) {
    const t = (x / width) * cycles + phase
    let sum = 0
    for (const ratio of ratios) sum += Math.sin(2 * Math.PI * ratio * t)
    samples.push(sum)
    peak = Math.max(peak, Math.abs(sum))
  }
  if (peak === 0) return

  // Normalised to a constant visual amplitude: a four-note chord should not be
  // louder-looking than a triad simply for having more terms.
  const amplitude = (16 + volume * 74) * scale
  const hue = DEGREE_HUES[degree] ?? DEGREE_HUES[1]

  const trace = () => {
    ctx.beginPath()
    samples.forEach((sample, i) => {
      const x = i * STEP * scale
      const y = centreY + (sample / peak) * amplitude
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }

  // A travelling highlight, so the band has depth without another colour.
  const shimmer = (Math.sin((now / 1000) * 0.35) * 0.5 + 0.5) * 0.6 + 0.2
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, `rgba(${hue}, 0.35)`)
  gradient.addColorStop(Math.max(0.01, shimmer - 0.18), `rgba(${hue}, 0.75)`)
  gradient.addColorStop(shimmer, `rgb(${hue})`)
  gradient.addColorStop(Math.min(0.99, shimmer + 0.18), `rgba(${hue}, 0.75)`)
  gradient.addColorStop(1, `rgba(${hue}, 0.35)`)

  ctx.save()
  ctx.globalAlpha = (major ? 1 : 0.72) * (spec.alpha ?? 1)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = gradient
  ctx.shadowColor = `rgb(${hue})`

  // Three passes: a wide soft halo, a mid body, and a crisp core. Bloom from
  // stacked strokes rather than a blur filter, which is far cheaper per frame.
  for (const [lineWidth, alpha, blur] of [
    [14, 0.07, 44],
    [6, 0.14, 26],
    [2.4, 0.4, 12],
    [1.2, 1, 0],
  ] as const) {
    ctx.lineWidth = lineWidth * scale
    ctx.globalAlpha = (major ? 1 : 0.72) * (spec.alpha ?? 1) * alpha
    ctx.shadowBlur = blur * scale
    trace()
  }
  ctx.restore()
}
