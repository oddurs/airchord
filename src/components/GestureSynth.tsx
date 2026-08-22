'use client'

import { useEffect, useState } from 'react'
import { useGestureSynth } from '@/hooks/useGestureSynth'
import { usePractice } from '@/hooks/usePractice'
import About from './About'
import CapturePanel from './CapturePanel'
import Controls from './Controls'
import Guide from './Guide'
import Hud from './Hud'
import SongPanel from './SongPanel'
import styles from './GestureSynth.module.css'

export default function GestureSynth() {
  const {
    videoRef,
    canvasRef,
    hud,
    phase,
    error,
    keyIndex,
    setKeyIndex,
    setWave,
    start,
    toggleLatch,
    observe,
    setTarget,
    onCommit,
    audio,
  } = useGestureSynth()
  const practice = usePractice({
    setTarget,
    onCommit,
    audio,
    running: phase === 'running',
    keyIndex,
    onKeyChange: setKeyIndex,
  })
  // Opt-in via ?capture so the dataset tool never clutters normal play.
  const [capturing, setCapturing] = useState(false)
  useEffect(() => {
    setCapturing(new URLSearchParams(window.location.search).has('capture'))
  }, [])
  const [guideOpen, setGuideOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Space is the sustain pedal. Every keyboard instrument has one, and it is
  // the answer to the only real objection to playing this for a whole song:
  // your arms get tired.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const focused = document.activeElement?.tagName
      if (focused === 'BUTTON' || focused === 'SELECT' || focused === 'INPUT') return
      e.preventDefault()
      toggleLatch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleLatch])

  return (
    <main className={styles.stage}>
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
      <canvas ref={canvasRef} className={styles.canvas} />

      <Controls
        keyIndex={keyIndex}
        onKeyChange={setKeyIndex}
        onWaveChange={setWave}
        guideOpen={guideOpen}
        onToggleGuide={() => setGuideOpen((open) => !open)}
        onOpenAbout={() => setAboutOpen(true)}
        latched={hud.latched}
        onToggleLatch={toggleLatch}
      />
      {guideOpen && !capturing && <Guide />}
      {phase === 'running' && !capturing && (
        <SongPanel
          songs={practice.songs}
          song={practice.song}
          mode={practice.mode}
          tempoScale={practice.tempoScale}
          state={practice.state}
          onChoose={practice.choose}
          onMode={practice.setMode}
          onTempo={practice.setTempoScale}
        />
      )}
      {capturing && phase === 'running' && <CapturePanel observe={observe} />}
      <Hud hud={hud} />

      {phase === 'running' && hud.hands === 0 && (
        <p className={`${styles.hint} label`}>Hold both hands up to the camera</p>
      )}
      {phase === 'loading' && <p className={`${styles.status} label`}>Loading hand tracking</p>}
      {phase === 'error' && <p className={styles.status}>{error}</p>}

      {phase === 'idle' && (
        <button type="button" className={styles.startOverlay} onClick={start}>
          <span className={styles.startTitle}>Handi Chord</span>
          <span className={styles.startStandfirst}>A chord synthesiser you play with your hands.</span>
          <span className={`${styles.startAction} label`}>Begin</span>
          <span className={styles.startNote}>Needs your camera · nothing leaves this device</span>
        </button>
      )}

      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </main>
  )
}
