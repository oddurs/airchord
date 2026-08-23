'use client'

import { KEYS } from '@/lib/chords'
import { BPM_RANGE, SIGNATURES } from '@/lib/beat'
import { TIMBRES, type TimbreId } from '@/lib/timbre'
import type { CalibrationState } from '@/hooks/useGestureSynth'
import type { MidiPort, MidiStatus } from '@/lib/midi'
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
  calibration: CalibrationState
  onCalibrate: () => void
  readoutOpen: boolean
  onToggleReadout: () => void
  recording: boolean
  recordingSeconds: number
  onToggleRecording: () => void
  midiStatus: MidiStatus
  midiPorts: MidiPort[]
  midiPort: string
  onEnableMidi: () => void
  onSelectMidiPort: (id: string) => void
}

const MIDI_LABEL: Record<MidiStatus, string> = {
  unsupported: 'No MIDI here',
  idle: 'MIDI',
  asking: 'Asking…',
  ready: 'MIDI',
  denied: 'MIDI refused',
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
  readoutOpen,
  onToggleReadout,
  recording,
  recordingSeconds,
  onToggleRecording,
  midiStatus,
  midiPorts,
  midiPort,
  onEnableMidi,
  onSelectMidiPort,
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

      {midiStatus === 'ready' && midiPorts.length > 0 && (
        <label className={styles.field}>
          <span className={`${styles.name} label`}>MIDI</span>
          <select
            className={styles.select}
            value={midiPort}
            onChange={(e) => onSelectMidiPort(e.target.value)}
          >
            {midiPorts.map((port) => (
              <option key={port.id} value={port.id}>
                {port.name}
              </option>
            ))}
          </select>
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
          title={
            calibration.step?.hint ??
            calibration.problem ??
            'Measures your hands: lean, reach and thumb'
          }
        >
          {calibration.step
            ? calibration.step.title
            : calibration.problem
              ? 'Try again'
              : calibration.saved
                ? 'Calibrated'
                : 'Calibrate'}
        </button>
        <button
          type="button"
          className={`${styles.link} label`}
          onClick={onToggleReadout}
          aria-pressed={readoutOpen}
          title="Show what the instrument is reading from your hands"
        >
          Readout
        </button>
        <button
          type="button"
          className={`${styles.link} label`}
          onClick={onToggleRecording}
          aria-pressed={recording}
          title="Record a stretch of playing, to replay against future changes"
        >
          {recording ? `Recording ${recordingSeconds}s` : 'Record'}
        </button>
        {midiStatus !== 'ready' && (
          <button
            type="button"
            className={`${styles.link} label`}
            onClick={onEnableMidi}
            disabled={midiStatus === 'unsupported' || midiStatus === 'asking'}
            title={
              midiStatus === 'unsupported'
                ? 'This browser does not support MIDI out — Chrome or Firefox do'
                : 'Play any instrument that takes MIDI'
            }
          >
            {MIDI_LABEL[midiStatus]}
          </button>
        )}
      </nav>

      {(calibration.step || calibration.problem) && (
        <p className={styles.coaching}>
          {calibration.step ? calibration.step.hint : calibration.problem}
        </p>
      )}
    </div>
  )
}
