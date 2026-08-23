'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Diagnostics } from '@/lib/engine'
import styles from './Readout.module.css'

/** Ten times a second: fast enough to watch, slow enough to read. */
const REFRESH_MS = 100
const DIGITS = ['T', 'I', 'M', 'R', 'P']

/**
 * What the instrument believes, on screen.
 *
 * Every fault reported against this thing has been ambiguous — "wrong chord"
 * can mean the degree, the quality, the octave or silence — and each ambiguity
 * cost a round trip through somebody playing. Reading its own mind is cheaper.
 *
 * It polls rather than subscribing, so the render loop is never waiting on
 * React to draw a number.
 */
export default function Readout({ read }: { read: () => Diagnostics | null }) {
  const [d, setD] = useState<Diagnostics | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setD(read()), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [read])

  const copy = useCallback(() => {
    const snapshot = read()
    if (!snapshot) return
    void navigator.clipboard?.writeText(JSON.stringify(snapshot, null, 2)).then(
      () => setCopied(true),
      () => setCopied(false),
    )
    window.setTimeout(() => setCopied(false), 1500)
  }, [read])

  if (!d) return null

  const hand = (fingers: Diagnostics['fingers']['left']) =>
    fingers ? DIGITS.map((n, i) => (fingers[i] ? n : '·')).join(' ') : '—'

  return (
    <aside className={styles.readout}>
      <Row label="State" value={d.reason} strong />
      <Row label="Left" value={hand(d.fingers.left)} mono />
      <Row label="Right" value={hand(d.fingers.right)} mono />
      <Row label="Degree" value={d.degree === null ? '—' : String(d.degree)} mono />
      <Row
        label="Lean"
        mono
        value={
          d.lean
            ? `${d.lean.value >= 0 ? '+' : ''}${d.lean.value.toFixed(3)}  ${d.lean.leaned ? 'leaned' : 'upright'}`
            : '—'
        }
      />
      <Row label="" value={d.lean ? `engage ${d.lean.engage.toFixed(3)} · release ${d.lean.release.toFixed(3)}` : ''} faint mono />
      <Row label="Register" value={d.register > 0 ? '+1' : d.register < 0 ? '−1' : '0'} mono />
      <Row
        label="Thumb"
        mono
        value={d.thumb.left === null ? '—' : `${d.thumb.left.toFixed(3)}  (out at ${d.thumb.on.toFixed(2)})`}
      />
      <Row label="FPS" value={d.fps.toFixed(0)} faint mono />

      <button type="button" className={`${styles.copy} label`} onClick={copy}>
        {copied ? 'Copied' : 'Copy snapshot'}
      </button>
    </aside>
  )
}

function Row({
  label,
  value,
  mono,
  faint,
  strong,
}: {
  label: string
  value: string
  mono?: boolean
  faint?: boolean
  strong?: boolean
}) {
  if (!value) return null
  return (
    <div className={styles.row}>
      <span className={`${styles.label} label`}>{label}</span>
      <span
        className={[mono ? styles.mono : '', faint ? styles.faint : '', strong ? styles.strong : '']
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  )
}
