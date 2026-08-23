'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createTracker, loadModel, readHands } from '@/lib/vision'
import { KEYS } from '@/lib/chords'
import { Engine, IDLE_HUD, hudEqual, type Hud } from '@/lib/engine'
import { isValid, type Calibration, type Step } from '@/lib/calibration'
import type { PoseTarget } from '@/lib/pose'
import { DEFAULT_TIMBRE, type TimbreId } from '@/lib/timbre'
import { recall, remember } from '@/lib/remember'

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

const CALIBRATION_KEY = 'airchord.calibration'

export interface CalibrationState {
  /** The step being held right now, or null when nothing is running. */
  step: Step | null
  /** Set when a run was refused, naming what went wrong. */
  problem: string | null
  saved: boolean
}

/** Anything malformed or from an older schema is ignored rather than trusted. */
function readCalibration(): Calibration | null {
  try {
    const raw = window.localStorage.getItem(CALIBRATION_KEY)
    if (!raw) return null
    const saved: unknown = JSON.parse(raw)
    return isValid(saved) ? saved : null
  } catch {
    return null
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
  const [timbre, setTimbreState] = useState<TimbreId>(DEFAULT_TIMBRE)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stage, setStage] = useState<Stage>('audio')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [calibration, setCalibration] = useState<CalibrationState>({
    step: null,
    problem: null,
    saved: false,
  })

  useEffect(() => {
    keyRef.current = keyIndex
  }, [keyIndex])

  useEffect(() => {
    const key = recall('key', DEFAULT_KEY)
    if (key >= 0 && key < KEYS.length) setKeyIndex(key)
    setTimbreState(recall<TimbreId>('timbre', DEFAULT_TIMBRE))
  }, [])

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
      const saved = readCalibration()
      if (saved) {
        engine.setCalibration(saved)
        setCalibration({ step: null, problem: null, saved: true })
      }
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
      const lost = (message: string) => {
        silence()
        setError(message)
        setPhase('error')
      }
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => lost('The camera stopped. Reconnect it and try again.'))
      }

      // A camera can disappear without its track ending — unplugged while the
      // tab is hidden, or claimed by another application. Watching the device
      // list catches what the track event misses.
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId
      const onDeviceChange = async () => {
        if (!active) return
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const stillThere = devices.some((d) => d.kind === 'videoinput' && d.deviceId === active)
          if (!stillThere) lost('That camera is no longer available. Try again to pick another.')
        } catch {
          // Enumeration can fail transiently; a missing answer is not a missing
          // camera, so this stays quiet rather than stopping the instrument.
        }
      }
      navigator.mediaDevices.addEventListener?.('devicechange', onDeviceChange)
      cleanupRef.current = () => {
        document.removeEventListener('visibilitychange', onHidden)
        window.removeEventListener('pagehide', silence)
        navigator.mediaDevices.removeEventListener?.('devicechange', onDeviceChange)
        for (const track of stream?.getTracks() ?? []) track.stop()
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
    void import('@/lib/replay-check').then(({ runReplayCheck }) => {
      ;(window as Window & { __replayCheck?: unknown }).__replayCheck = runReplayCheck
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

  /**
   * Tears the session down and returns to the start, so a camera that was
   * unplugged or claimed by another application is recoverable without
   * reloading — which would also throw away the calibration for this session.
   */
  const retry = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    cleanupRef.current?.()
    cleanupRef.current = null
    engineRef.current?.dispose()
    engineRef.current = null
    setError('')
    setPhase('idle')
  }, [])

  const setTimbre = useCallback((id: TimbreId) => {
    setTimbreState(id)
    remember('timbre', id)
    engineRef.current?.setTimbre(id)
  }, [])

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

  /**
   * Records where this player actually holds an upright hand. The built-in
   * neutral is one person's, measured in one sitting, and where a hand sits
   * while playing is not where it sits while posing for a capture.
   */
  /** Polled by the readout, so drawing a number never blocks the render loop. */
  const readDiagnostics = useCallback(() => engineRef.current?.diagnostics ?? null, [])

  const calibrateLean = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    setCalibration({ step: null, problem: null, saved: false })
    engine.beginCalibration(
      (step) => setCalibration((prev) => ({ ...prev, step })),
      (result) => {
        if ('problems' in result) {
          // Refusing is deliberate: a calibration derived from holds that cannot
          // be told apart is worse than the defaults, because it looks measured.
          const first = result.problems[0]
          setCalibration({ step: null, problem: `${first.step}: ${first.reason}`, saved: false })
          return
        }
        try {
          window.localStorage.setItem(CALIBRATION_KEY, JSON.stringify(result.calibration))
        } catch {
          // Private browsing. It applies to this session, just isn't remembered.
        }
        setCalibration({ step: null, problem: null, saved: true })
      },
    )
  }, [])

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
    timbre,
    setTimbre,
    start,
    stage,
    progress,
    toggleLatch,
    observe,
    calibrateLean,
    calibration,
    readDiagnostics,
    retry,
    setTarget,
    onCommit,
    audio,
  }
}
