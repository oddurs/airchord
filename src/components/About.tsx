'use client'

import { useEffect, useRef } from 'react'
import styles from './About.module.css'

export default function About({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          Close
        </button>

        <h2 id="about-title" className={styles.title}>
          Handi Chord
        </h2>
        <p className={styles.standfirst}>A chord synthesiser you play with your hands.</p>

        <p>
          Your left hand picks the chord; your right hand shapes how it sounds — voicing, octave,
          filter, and volume. The lean of your left wrist overrides the key, which is how a borrowed
          minor chord falls out of a flick. Open the guide for the full vocabulary.
        </p>

        <p>
          This is an independent reimplementation of <b>Gesture Synth</b>, created by{' '}
          <a href="https://indecisiveeric.com" target="_blank" rel="noopener noreferrer">
            Eric Wei
          </a>
          . The original is well worth playing —{' '}
          <a href="https://gesture-synth-weld.vercel.app/" target="_blank" rel="noopener noreferrer">
            try it here
          </a>{' '}
          or read its{' '}
          <a href="https://github.com/ericwei97-cloud/gesture-synth" target="_blank" rel="noopener noreferrer">
            source
          </a>
          . Its gesture vocabulary and musical design are his; this build reimplements them from
          scratch, with his blessing to adapt so long as credit is given. Non-commercial use only.
        </p>

        <p className={styles.colophon}>
          Hand tracking runs entirely in your browser using MediaPipe. Video frames never leave your
          device, and nothing is recorded or uploaded.
        </p>
      </div>
    </div>
  )
}
