'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createTracker, loadModel, readHands } from '@/lib/vision'
import { KEYS } from '@/lib/chords'
import { Engine, IDLE_HUD, hudEqual, type Hud } from '@/lib/engine'
import type { PoseTarget } from '@/lib/pose'
import type { Wave } from '@/lib/synth'

const DEFAULT_KEY = KEYS.findIndex((k) => k.name === 'E')

export type Phase = 'idle' | 'loading' | 'running' | 'error'

/** What the instrument is doing while it starts, in the order it happens. */
export type Stage = 'audio' | 'camera' | 'model' | 'tracker'

export const STAGE_LABEL: Record<Stage, string> = {
  audio: 'Waking the synth',
  camera: 'Asking for the camera',
  model: 'Downloading the hand model',
  tracker: 'Starting hand tracking',
}

/**
 * Camera failures are the most likely thing to go wrong and the least
 * self-explanatory, so each one gets an answer rather than a DOMException name.
 */
function describe(err: unknown): string {
  // Not everything that fails is an Error. A media element or a failed script
  // load rejects with an Event, and `String(event)` is "[object Event]" — which
  // tells a player nothing at all about what went wrong.
  if (typeof Event !== 'undefined' && err instanceof Event) {
    const source = (err.target as { src?: string } | null)?.src
    return source
      ? `Failed to load ${new URL(source, location.href).pathname}. Check your connection and reload.`
      : 'Something failed to load. Check your connection and reload.'
  }
  if (typeof err === 'string') return err
  if (!(err instanceof Error)) return 'Could not start the instrument. Reload and try again.'

  switch (err.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Allow it in your browser\u2019s site settings, then reload.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found. Connect one and reload.'
    case 'NotReadableError':
      return 'The camera is in use by another app. Close it and reload.'
    default:
      return err.message
  }
}

export function useGestureSynth() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const keyRef = useRef(DEFAULT_KEY)
  const hudRef = useRef<Hud>(IDLE_HUD)
  const frameRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [hud, setHud] = useState<Hud>(IDLE_HUD)
  const [keyIndex, setKeyIndex] = useState(DEFAULT_KEY)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stage, setStage] = useState<Stage>('audio')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    keyRef.current = keyIndex
  }, [keyIndex])

  const start = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || phase !== 'idle') return

    setPhase('loading')
    let stream: MediaStream | undefined
    try {
      setStage('audio')
      const engine = new Engine(canvas)
      engineRef.current = engine
      await engine.start()

      setStage('camera')

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access needs https. See the README for local certificates.')
      }
      stream = await navigator.mediaDevices.getUserMedia({
        // 60fps halves the frame interval, which is the largest latency term
        // the instrument can actually influence. Ideal, not exact: a camera
        // that can only manage 30 should still work.
        video: { width: 1280, height: 720, frameRate: { ideal: 60 }, facingMode: 'user' },
        audio: false,
      })
      video.srcObject = stream
      await video.play()

      setStage('model')
      const model = await loadModel(setProgress)

      setStage('tracker')
      const tracker = await createTracker(model)
      setPhase('running')

      let lastTime = -1
      const loop = () => {
        frameRef.current = requestAnimationFrame(loop)
        if (video.currentTime === lastTime) return
        lastTime = video.currentTime
        const now = performance.now()
        const hands = readHands(tracker, video, now)
        const inferenceMs = performance.now() - now
        const next = engine.frame({ hands, video, key: KEYS[keyRef.current], now, inferenceMs })
        // The loop runs at 60fps but the HUD only changes a few times a second,
        // so React is only woken when a displayed value actually moves.
        if (!hudEqual(next, hudRef.current)) {
          hudRef.current = next
          setHud(next)
        }
      }
      loop()

      // The exits that are not gestures. Without these the instrument plays on
      // to a hidden tab or an unplugged camera.
      const silence = () => engine.silence()
      const onHidden = () => {
        if (document.visibilityState === 'hidden') silence()
      }
      document.addEventListener('visibilitychange', onHidden)
      window.addEventListener('pagehide', silence)
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          silence()
          setError('The camera stopped. Reconnect it and reload.')
          setPhase('error')
        })
      }
      cleanupRef.current = () => {
        document.removeEventListener('visibilitychange', onHidden)
        window.removeEventListener('pagehide', silence)
      }
    } catch (err) {
      // Keep the raw failure in the console; the message on screen is for a
      // player, not for whoever has to debug it.
      console.error('Airchord failed to start', err)
      stream?.getTracks().forEach((t) => t.stop())
      setError(describe(err))
      setPhase('error')
    }
  }, [phase])

  // Exposes the offline audio measurement on page load, so `npm run audio` can
  // render and measure the real signal path without a camera or a user gesture.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    void import('@/lib/audio-check').then(({ runAudioCheck }) => {
      ;(window as Window & { __audioCheck?: unknown }).__audioCheck = runAudioCheck
    })
  }, [])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current)
      cleanupRef.current?.()
      engineRef.current?.dispose()
      const stream = videoRef.current?.srcObject
      if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const setWave = useCallback((wave: Wave) => engineRef.current?.setWave(wave), [])

  const observe = useCallback((cb: Parameters<Engine['observe']>[0]) => {
    engineRef.current?.observe(cb)
  }, [])

  /** The three things a practice session needs from the instrument: what to
   *  ask for, what the hands did, and the clock the chords are already on. */
  const setTarget = useCallback((target: PoseTarget | null) => {
    engineRef.current?.setTarget(target)
  }, [])

  const onCommit = useCallback((listener: Engine['onCommit']) => {
    if (engineRef.current) engineRef.current.onCommit = listener
  }, [])

  const audio = useCallback(() => engineRef.current?.audio ?? null, [])

  const toggleLatch = useCallback(() => {
    const engine = engineRef.current
    if (engine) engine.setLatched(!engine.latched)
  }, [])

  return {
    videoRef,
    canvasRef,
    hud,
    phase,
    error,
    keyIndex,
    setKeyIndex,
    setWave,
    start,
    stage,
    progress,
    toggleLatch,
    observe,
    setTarget,
    onCommit,
    audio,
  }
}
