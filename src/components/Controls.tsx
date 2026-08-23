'use client'

import { KEYS } from '@/lib/chords'
import { BPM_RANGE, SIGNATURES } from '@/lib/beat'
import { TIMBRES, type TimbreId } from '@/lib/timbre'
import type { CalibrationStatus } from '@/hooks/useGestureSynth'
import styles from './Controls.module.css'

interface Props {
  keyIndex: number
  onKeyChange: (index: number) => void
  timbre: TimbreId
  onTimbreChange: (id: TimbreId) => void
  beat: string | null
  onBeatChange: (id: string | null) => void
  bpm: number
  onBpmChange: (bpm: number) => void
  guideOpen: boolean
  onToggleGuide: () => void
  onOpenAbout: () => void
  latched: boolean
  onToggleLatch: () => void
  calibration: CalibrationStatus
  onCalibrate: () => void
}

const CALIBRATION_LABEL: Record<CalibrationStatus, string> = {
  idle: 'Calibrate',
  upright: 'Hold upright…',
  leaned: 'Now lean…',
  done: 'Calibrated',
  failed: 'Try again',
}

export default function Controls({
  keyIndex,
  onKeyChange,
  timbre,
  onTimbreChange,
  beat,
  onBeatChange,
  bpm,
  onBpmChange,
  guideOpen,
  onToggleGuide,
  onOpenAbout,
  latched,
  onToggleLatch,
  calibration,
  onCalibrate,
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

      <label className={styles.field}>
        <span className={`${styles.name} label`}>Beat</span>
        <select
          className={styles.select}
          value={beat ?? ''}
          onChange={(e) => onBeatChange(e.target.value || null)}
        >
          <option value="">Off</option>
          {SIGNATURES.map(({ id, label }) => (
            <option key={id} value={id}>
              {id} · {label.toLowerCase()}
            </option>
          ))}
        </select>
      </label>

      {beat && (
        <label className={styles.field}>
          <span className={`${styles.name} label`}>Tempo</span>
          <span className={styles.tempo}>
            <input
              className={styles.slider}
              type="range"
              min={BPM_RANGE.min}
              max={BPM_RANGE.max}
              step={1}
              value={bpm}
              onChange={(e) => onBpmChange(Number(e.target.value))}
              aria-label="Tempo in beats per minute"
            />
            <span className={`${styles.bpm} tabular`}>{bpm}</span>
          </span>
        </label>
      )}

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
        <button
          type="button"
          className={`${styles.link} label`}
          onClick={onCalibrate}
          title="Hold your chord hand upright and comfortable for two seconds"
        >
          {CALIBRATION_LABEL[calibration]}
        </button>
      </nav>
    </div>
  )
}
