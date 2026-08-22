'use client'

import { KEYS } from '@/lib/chords'
import type { Wave } from '@/lib/synth'
import styles from './Controls.module.css'

interface Props {
  keyIndex: number
  onKeyChange: (index: number) => void
  onWaveChange: (wave: Wave) => void
  guideOpen: boolean
  onToggleGuide: () => void
  onOpenAbout: () => void
  latched: boolean
  onToggleLatch: () => void
}

const WAVES: [Wave, string][] = [
  ['triangle', 'Warm'],
  ['sawtooth', 'Bright'],
  ['square', 'Retro'],
]

export default function Controls({
  keyIndex,
  onKeyChange,
  onWaveChange,
  guideOpen,
  onToggleGuide,
  onOpenAbout,
  latched,
  onToggleLatch,
}: Props) {
  return (
    <div className={styles.controls}>
      <label className={styles.field}>
        <span className={`${styles.name} label`}>Key</span>
        <select className={styles.select} value={keyIndex} onChange={(e) => onKeyChange(Number(e.target.value))}>
          {KEYS.map((key, i) => (
            <option key={key.name} value={i}>
              {key.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={`${styles.name} label`}>Tone</span>
        <select className={styles.select} defaultValue="triangle" onChange={(e) => onWaveChange(e.target.value as Wave)}>
          {WAVES.map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
      </label>

      <nav className={styles.links}>
        <button
          type="button"
          className={`${styles.link} label`}
          onClick={onToggleLatch}
          aria-pressed={latched}
          title="Hold the current chord so your hands can rest (space)"
        >
          Hold
        </button>
        <button type="button" className={`${styles.link} label`} onClick={onToggleGuide} aria-expanded={guideOpen}>
          Guide
        </button>
        <button type="button" className={`${styles.link} label`} onClick={onOpenAbout}>
          About
        </button>
      </nav>
    </div>
  )
}
