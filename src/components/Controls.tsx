'use client'

import { KEYS } from '@/lib/chords'
import { TIMBRES, type TimbreId } from '@/lib/timbre'
import styles from './Controls.module.css'

interface Props {
  keyIndex: number
  onKeyChange: (index: number) => void
  timbre: TimbreId
  onTimbreChange: (id: TimbreId) => void
  guideOpen: boolean
  onToggleGuide: () => void
  onOpenAbout: () => void
  latched: boolean
  onToggleLatch: () => void
}

export default function Controls({
  keyIndex,
  onKeyChange,
  timbre,
  onTimbreChange,
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
        <select
          className={styles.select}
          value={timbre}
          onChange={(e) => onTimbreChange(e.target.value as TimbreId)}
        >
          {TIMBRES.map(({ id, name, note }) => (
            <option key={id} value={id}>
              {name} · {note.toLowerCase()}
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
