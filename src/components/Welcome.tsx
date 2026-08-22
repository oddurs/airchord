'use client'

import type { Step } from '@/hooks/useOnboarding'
import styles from './Welcome.module.css'

/**
 * One instruction at a time, in the middle of the frame, with the pose it is
 * asking for drawn on the player's own hand by the overlay. No chord names, no
 * theory, nothing to read twice.
 */

interface Props {
  step: Step | undefined
  index: number
  total: number
  finished: boolean
  onSkip: () => void
}

export default function Welcome({ step, index, total, finished, onSkip }: Props) {
  return (
    <section className={styles.welcome} aria-live="polite">
      {finished ? (
        <p className={styles.prompt}>That is the whole instrument.</p>
      ) : (
        <>
          <p className={styles.prompt}>{step?.prompt}</p>
          {step?.aside && <p className={styles.aside}>{step.aside}</p>}
        </>
      )}

      <div className={styles.progress} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < index || finished ? styles.dotDone : i === index ? styles.dotNow : styles.dot} />
        ))}
      </div>

      {!finished && (
        <button type="button" className={`${styles.skip} label`} onClick={onSkip}>
          Skip
        </button>
      )}
    </section>
  )
}
