'use client'

import { useEffect, useRef } from 'react'
import { KEYS, buildChord } from '@/lib/chords'
import { paintWave } from '@/lib/wave'
import styles from './LandingWave.module.css'

/** Seconds each scale degree holds before the next fades in. */
const HOLD = 4.5
const FADE = 1.4

/**
 * The instrument's own energy wave, playing to itself. The landing page shows
 * the real thing rather than a picture of it — same code, same hues, same
 * mapping — so the first thing anyone sees is what the instrument does.
 *
 * It also carries through the loading state, which is what keeps starting up
 * from feeling like a splash screen followed by a spinner.
 */
const KEY = KEYS.find((key) => key.name === 'E') ?? KEYS[0]

/** Positive modulo. `-1 % 4` is -1 in JavaScript, which indexes nothing. */
const wrap = (value: number, size: number) => ((value % size) + size) % size

export default function LandingWave() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let scale = 1
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * scale)
      canvas.height = Math.round(canvas.clientHeight * scale)
    }
    resize()
    window.addEventListener('resize', resize)

    const started = performance.now()
    let frame = 0

    const draw = () => {
      const now = still ? started + 2600 : performance.now()
      const elapsed = (now - started) / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Degrees hand over to one another rather than cutting, so the hue moves
      // the way a chord change does.
      const step = elapsed / HOLD
      const index = Math.floor(step)
      const into = (step - index) * HOLD
      const blend = Math.min(1, into / FADE)

      const shared = {
        centreY: canvas.height / 2,
        scale,
        volume: 0.4 + Math.sin(elapsed * 0.5) * 0.14,
        // Tilt drives the jitter, and jitter at full range reads as a
        // seismograph rather than an instrument. Held low and moving slowly.
        tilt: -0.62 + Math.sin(elapsed * 0.23) * 0.22,
        now,
      }

      // Real chords, built the way the instrument builds them, so the landing
      // page draws genuine interference patterns rather than plausible ones.
      // Every index here can go negative on the outgoing chord, and JavaScript's
      // `%` keeps the sign — so they all wrap explicitly.
      const at = (n: number) => {
        const step = index + n
        const degree = wrap(step, 7) + 1
        const major = wrap(step, 3) !== 2
        const voicing = wrap(step, 4) + 1
        const chord = buildChord(KEY, { degree, major, voicing, octave: 0 })
        return { degree, major, freqs: chord?.freqs ?? [] }
      }

      if (blend < 1) paintWave(ctx, { ...shared, ...at(-1), alpha: 1 - blend })
      paintWave(ctx, { ...shared, ...at(0), alpha: blend })

      if (!still) frame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className={styles.wave} aria-hidden="true" />
}
