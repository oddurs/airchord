'use client'

import { useEffect, useState } from 'react'
import { useGestureSynth } from '@/hooks/useGestureSynth'
import { useBeat } from '@/hooks/useBeat'
import { useOnboarding } from '@/hooks/useOnboarding'
import { usePractice } from '@/hooks/usePractice'
import About from './About'
import CapturePanel from './CapturePanel'
import Controls from './Controls'
import Guide from './Guide'
import Landing from './Landing'
import Readout from './Readout'
import { useRecorder } from '@/hooks/useRecorder'
import { KEYS } from '@/lib/chords'
import Hud from './Hud'
import SongPanel from './SongPanel'
import Welcome from './Welcome'
import styles from './GestureSynth.module.css'

export default function GestureSynth() {
  const {
    videoRef,
    canvasRef,
    hud,
    phase,
    stage,
    progress,
    error,
    keyIndex,
    setKeyIndex,
    timbre,
    setTimbre,
    start,
    toggleLatch,
    observe,
    calibrateLean,
    calibration,
    readDiagnostics,
    retry,
    setTarget,
    onCommit,
    audio,
  } = useGestureSynth()
  // Shown once, and it owns the screen while it runs: a first instruction
  // competing with a song lane is two things asking to be read at once.
  const beat = useBeat({ audio, running: phase === 'running', timbre })
  const tour = useOnboarding({ hud, running: phase === 'running', setTarget })
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
  const [songsOpen, setSongsOpen] = useState(false)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    setCapturing(query.has('capture'))
    setSongsOpen(query.has('songs'))
  }, [])
  const [guideOpen, setGuideOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [readoutOpen, setReadoutOpen] = useState(false)
  const recorder = useRecorder(observe, KEYS[keyIndex]?.name ?? 'E')
  // ?debug opens it without hunting for the control.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) setReadoutOpen(true)
  }, [])

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
        timbre={timbre}
        onTimbreChange={setTimbre}
        beat={beat.signature}
        onBeatChange={beat.setSignature}
        bpm={beat.bpm}
        onBpmChange={beat.setBpm}
        guideOpen={guideOpen}
        onToggleGuide={() => setGuideOpen((open) => !open)}
        onOpenAbout={() => setAboutOpen(true)}
        latched={hud.latched}
        onToggleLatch={toggleLatch}
        calibration={calibration}
        onCalibrate={calibrateLean}
        readoutOpen={readoutOpen}
        onToggleReadout={() => setReadoutOpen((open) => !open)}
        recording={recorder.recording}
        recordingSeconds={recorder.seconds}
        onToggleRecording={recorder.toggle}
      />
      {guideOpen && !capturing && <Guide />}
      {phase === 'running' && songsOpen && !capturing && !tour.active && (
        <SongPanel
          songs={practice.songs}
          song={practice.song}
          mode={practice.mode}
          tempoScale={practice.tempoScale}
          state={practice.state}
          onChoose={practice.choose}
          onMode={practice.setMode}
          onTempo={practice.setTempoScale}
          transport={practice.transport}
          onToggle={practice.toggle}
          onStop={practice.stop}
        />
      )}
      {capturing && phase === 'running' && <CapturePanel observe={observe} />}
      <Hud hud={hud} />

      {tour.active && (
        <Welcome step={tour.step} index={tour.index} total={tour.total} finished={tour.finished} onSkip={tour.skip} />
      )}

      {phase === 'running' && hud.hands === 0 && !tour.active && (
        <p className={`${styles.hint} label`}>Hold both hands up to the camera</p>
      )}
      {phase === 'error' && (
        <div className={styles.status}>
          <p>{error}</p>
          <button type="button" className={`${styles.again} label`} onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {(phase === 'idle' || phase === 'loading') && (
        <Landing phase={phase} stage={stage} progress={progress} onStart={start} />
      )}

      {readoutOpen && phase === 'running' && <Readout read={readDiagnostics} />}
      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </main>
  )
}
