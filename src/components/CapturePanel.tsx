'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptureSession, POSES, type Pose } from '@/lib/capture'
import type { HandState, Side } from '@/lib/vision'
import styles from './CapturePanel.module.css'

type Observe = (callback: ((hands: HandState[]) => void) | null) => void

/** 1-9 then 0 and -, matching the list order, so hands never leave the frame. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-']

/**
 * Development tool for building the gesture dataset. Every accuracy failure so
 * far has been a pose the reference frames did not contain, so the point of this
 * is coverage — including the poses that must produce *no* chord.
 */
export default function CapturePanel({ observe }: { observe: Observe }) {
  const session = useRef<CaptureSession>(null as unknown as CaptureSession)
  if (session.current === null) session.current = new CaptureSession()

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [active, setActive] = useState<Pose | null>(null)
  const [progress, setProgress] = useState(0)
  const [recording, setRecording] = useState(false)
  const [visible, setVisible] = useState(0)
  const [side, setSide] = useState<Side>('left')
  const [status, setStatus] = useState('Pick a pose, then hold it up.')

  useEffect(() => {
    observe((hands) => {
      setVisible(hands.length)
      const state = session.current.accept(hands, performance.now())
      setProgress(state.captured)
      setRecording(state.recording)
      // Exposed so a session that misbehaves can be diagnosed from the console
      // rather than guessed at.
      ;(window as Window & { __capture?: unknown }).__capture = {
        ...state,
        visible: hands.length,
        total: session.current.total,
        counts: session.current.counts,
      }
      if (!state.done) return
      setCounts({ ...session.current.counts })
      setTotal(session.current.total)
      setActive(null)
      setProgress(0)
      setStatus(state.failed ?? 'Recorded. Pick the next pose.')
    })
    return () => observe(null)
  }, [observe])

  const record = useCallback((pose: Pose) => {
    // Nothing is recorded until hands are in view, so clicking a button with the
    // hand you are about to pose with is no longer a way to lose a take.
    session.current.begin(pose, performance.now(), side)
    setActive(pose)
    setProgress(0)
    setStatus(`Hold “${pose.title}” up to the camera`)
  }, [side])

  const cancel = useCallback(() => {
    session.current.cancel()
    setActive(null)
    setProgress(0)
    setRecording(false)
    setStatus('Cancelled.')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const index = KEYS.indexOf(e.key)
      if (index >= 0 && POSES[index]) {
        e.preventDefault()
        record(POSES[index])
      }
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [record, cancel])

  const download = useCallback(() => {
    const blob = new Blob([JSON.stringify(session.current.toDataset(), null, 1)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'gestures.json'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <aside className={styles.panel}>
      <h2 className={`${styles.heading} label`}>Capture</h2>
      <p className={styles.blurb}>
        Press a number, then hold the pose up with the hand named below. Only that hand is recorded,
        and only once it is in view — so take as long as you need. Capture every pose, including the
        ones that should make no sound.
      </p>
      <p className={styles.blurb}>
        Hands in view: <span className={styles.done}>{visible}</span> · posing with{' '}
        <button
          type="button"
          className={styles.action}
          onClick={() => setSide(side === 'left' ? 'right' : 'left')}
        >
          <span className={styles.done}>{side} hand</span>
        </button>
        {' '}(click to swap)
      </p>

      {POSES.map((pose) => (
        <button
          key={pose.id}
          type="button"
          className={styles.pose}
          data-active={active?.id === pose.id}
          onClick={() => record(pose)}
        >
          <span>
            <span className={styles.count}>{KEYS[POSES.indexOf(pose)]} </span>
            {pose.title}
            <span className={styles.hint}>{pose.hint}</span>
          </span>
          <span className={counts[pose.id] ? styles.done : styles.count}>{counts[pose.id] ?? 0}</span>
        </button>
      ))}

      <p className={styles.status}>
        {status}
        {active && (
          <span className={styles.count}>
            {recording ? ` — recording ${progress}/45` : ' — waiting for hands'}
          </span>
        )}
      </p>

      <div className={styles.actions}>
        <button type="button" className={`${styles.action} label`} onClick={download} disabled={total === 0}>
          Download ({total})
        </button>
        {active && (
          <button type="button" className={`${styles.action} label`} onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    </aside>
  )
}
