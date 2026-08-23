'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { HandState } from '@/lib/vision'
import { SESSION_VERSION, type Session, type SessionFrame } from '@/lib/session'

type Observe = (callback: ((hands: HandState[]) => void) | null) => void

/** Enough for several minutes; a guard against recording until the tab dies. */
const MAX_FRAMES = 20000

/**
 * Records a stretch of actual playing.
 *
 * The captured pose dataset is people holding still for a camera. This is the
 * other half: transitions, drift, hands leaving frame, hands doing nothing in
 * particular. It stores landmarks rather than decisions, so a session recorded
 * today still means something after the features are redesigned — and it can be
 * replayed through the engine to judge a change before anyone plays it.
 */
export function useRecorder(observe: Observe, keyName: string) {
  const frames = useRef<SessionFrame[]>([])
  const startedAt = useRef(0)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!recording) return
    observe((hands) => {
      if (frames.current.length >= MAX_FRAMES) return
      frames.current.push({
        t: performance.now() - startedAt.current,
        hands: hands.map((h) => ({ side: h.side, landmarks: h.raw })),
      })
    })
    const timer = window.setInterval(
      () => setSeconds(Math.round((performance.now() - startedAt.current) / 1000)),
      500,
    )
    return () => {
      observe(null)
      window.clearInterval(timer)
    }
  }, [recording, observe])

  const toggle = useCallback(() => {
    if (recording) {
      setRecording(false)
      const session: Session = {
        version: SESSION_VERSION,
        recorded: new Date().toISOString(),
        key: keyName,
        frames: frames.current,
      }
      const blob = new Blob([JSON.stringify(session)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `session-${Date.now()}.json`
      link.click()
      URL.revokeObjectURL(url)
      frames.current = []
      setSeconds(0)
      return
    }
    frames.current = []
    startedAt.current = performance.now()
    setSeconds(0)
    setRecording(true)
  }, [recording, keyName])

  return { recording, seconds, toggle }
}
