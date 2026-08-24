'use client'

import { useEffect, useRef } from 'react'
import { KEYS, buildChord } from '@/lib/chords'
import { paintWave } from '@/lib/wave'
import styles from './LandingWave.module.css'

/** Seconds each chord holds before the next fades in. */
const HOLD = 4.5
const FADE = 1.4

const KEY = KEYS.find((key) => key.name === 'E') ?? KEYS[0]

/** Positive modulo. `-1 % 4` is -1 in JavaScript, which indexes nothing. */
const wrap = (value: number, size: number) => ((value % size) + size) % size

/**
 * Three copies of the same waveform at different depths.
 *
 * One line is a picture of a wave; three at different scales, speeds and
 * opacities is a field with somewhere to stand in it. They are all the same
 * chord — the far layers are the same interference pattern seen larger and
 * slower — so the depth is real rather than decorative.
 *
 * It also follows the pointer, faintly. The instrument's whole premise is that
 * moving your hands makes the sound move, and a landing page that answers the
 * mouse says that before a word does.
 */
/**
 * Slow, broad and few. The instrument draws a chord's real interference pattern
 * because there it is information; here nobody is playing, and the same
 * settings read as agitation. Long undulations that take their time.
 */
const LAYERS = [
  { scale: 2.6, alpha: 0.14, rate: 0.4, lift: 0.3, cycles: 0.7 },
  { scale: 1.5, alpha: 0.28, rate: 0.66, lift: 0.22, cycles: 1.1 },
  { scale: 1, alpha: 0.9, rate: 1, lift: 0.16, cycles: 1.5 },
]

/** Slow enough that the movement is felt rather than watched. */
const DRIFT = 0.05

export default function LandingWave() {
  const ref = useRef<HTMLCanvasElement>(null)
  const pointer = useRef({ x: 0.5, y: 0.5, active: false })

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

    const onPointer = (e: PointerEvent) => {
      pointer.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
        active: true,
      }
    }
    const onLeave = () => (pointer.current = { x: 0.5, y: 0.5, active: false })
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerleave', onLeave)

    const started = performance.now()
    let frame = 0
    // Eased rather than followed, so the field drifts toward the pointer.
    let aimX = 0.5
    let aimY = 0.5

    const draw = () => {
      const now = still ? started + 2600 : performance.now()
      const elapsed = (now - started) / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      aimX += (pointer.current.x - aimX) * 0.045
      aimY += (pointer.current.y - aimY) * 0.045

      const step = elapsed / HOLD
      const index = Math.floor(step)
      const blend = Math.min(1, ((step - index) * HOLD) / FADE)

      const at = (n: number) => {
        const s = index + n
        const degree = wrap(s, 7) + 1
        const major = wrap(s, 3) !== 2
        const voicing = wrap(s, 4) + 1
        const chord = buildChord(KEY, { degree, major, voicing, octave: 0 })
        return { degree, major, freqs: chord?.freqs ?? [] }
      }

      for (const layer of LAYERS) {
        const shared = {
          centreY: canvas.height * (0.5 + layer.lift) - (aimY - 0.5) * canvas.height * 0.05,
          scale: scale * layer.scale,
          volume: (0.36 + Math.sin(elapsed * 0.18) * 0.1) / layer.scale,
          // The pointer widens and narrows the undulation, the way a wrist would.
          tilt: -0.2 + (aimX - 0.5) * 0.5 + Math.sin(elapsed * 0.09) * 0.12,
          now: started + (now - started) * layer.rate,
          cycles: layer.cycles,
          jitter: 0,
          speed: DRIFT,
        }
        if (blend < 1) {
          paintWave(ctx, { ...shared, ...at(-1), alpha: (1 - blend) * layer.alpha })
        }
        paintWave(ctx, { ...shared, ...at(0), alpha: blend * layer.alpha })
      }

      if (!still) frame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={ref} className={styles.wave} aria-hidden="true" />
}
