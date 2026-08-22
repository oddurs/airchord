'use client'

import { STAGE_LABEL, type Phase, type Stage } from '@/hooks/useGestureSynth'
import LandingWave from './LandingWave'
import styles from './Landing.module.css'

interface Props {
  phase: Phase
  stage: Stage
  /** 0..1, and only meaningful while the model is downloading. */
  progress: number
  onStart: () => void
}

export default function Landing({ phase, stage, progress, onStart }: Props) {
  const ready = phase === 'idle'
  // Only the model download can report honest progress; the other stages are
  // quick and would be a lying bar.
  const fraction = stage === 'model' ? progress : 0

  return (
    <button
      type="button"
      className={styles.landing}
      data-ready={ready}
      onClick={ready ? onStart : undefined}
      aria-busy={!ready}
      aria-label={ready ? 'Begin' : STAGE_LABEL[stage]}
    >
      <LandingWave />

      <span className={styles.type}>
        <span className={styles.title}>Airchord</span>
        <span className={styles.standfirst}>A chord synthesiser you play with your hands.</span>

        <span className={styles.action}>
          <span className={styles.track} style={{ width: `${fraction * 100}%` }} />
          <span className={`${styles.label} label tabular`}>
            {ready ? 'Begin' : STAGE_LABEL[stage]}
            {stage === 'model' && !ready && (
              <span className={styles.percent}>{Math.round(progress * 100)}</span>
            )}
          </span>
        </span>

        <span className={styles.note}>Needs your camera · nothing leaves this device</span>
      </span>
    </button>
  )
}
