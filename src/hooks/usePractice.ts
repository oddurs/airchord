'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { KEYS } from '@/lib/chords'
import type { Engine } from '@/lib/engine'
import type { PoseTarget } from '@/lib/pose'
import { PracticeSession, type Mode, type PracticeState } from '@/lib/practice'
import { SONGS, songById, type Song } from '@/lib/songs'

export interface PracticeBridge {
  setTarget: (target: PoseTarget | null) => void
  onCommit: (listener: Engine['onCommit']) => void
  audio: () => { context: BaseAudioContext; destination: AudioNode } | null
  /** The instrument is running: there is a camera, a clock and an output. */
  running: boolean
  keyIndex: number
  onKeyChange: (index: number) => void
}

/**
 * Owns the practice session's lifetime and mirrors just enough of it into React.
 * The session itself runs on the audio clock and pushes state a few times a
 * second, which is the same bargain the HUD makes with the 60fps loop.
 */
export function usePractice(bridge: PracticeBridge) {
  const { setTarget, onCommit, audio, running, keyIndex, onKeyChange } = bridge

  const [song, setSong] = useState<Song | null>(null)
  const [mode, setMode] = useState<Mode>('learn')
  const [tempoScale, setTempoScale] = useState(1)
  const [state, setState] = useState<PracticeState | null>(null)

  const sessionRef = useRef<PracticeSession | null>(null)
  const keyRef = useRef(keyIndex)
  keyRef.current = keyIndex

  useEffect(() => {
    if (!song || !running) return

    const session = new PracticeSession({
      song,
      key: KEYS[keyRef.current],
      mode,
      audio: audio(),
      onChange: (next) => {
        setState(next)
        setTarget(next.lane[0] ?? null)
      },
    })
    sessionRef.current = session
    onCommit((degree, major, at) => session.commit(degree, major, at))
    session.start()

    return () => {
      onCommit(null)
      setTarget(null)
      session.dispose()
      sessionRef.current = null
      setState(null)
    }
  }, [song, mode, running, audio, onCommit, setTarget])

  // Key and tempo change the session in place: restarting the song because the
  // player nudged the tempo would be its own kind of rude.
  useEffect(() => {
    sessionRef.current?.setKey(KEYS[keyIndex])
  }, [keyIndex])

  useEffect(() => {
    sessionRef.current?.setTempoScale(tempoScale)
  }, [tempoScale])

  /** Choosing a song chooses its key: it is the key the song is in. */
  const choose = useCallback(
    (id: string | null) => {
      const next = id ? songById(id) : null
      setSong(next)
      if (next) {
        const index = KEYS.findIndex((k) => k.name === next.key)
        if (index >= 0) onKeyChange(index)
      }
    },
    [onKeyChange],
  )

  return { songs: SONGS, song, mode, tempoScale, state, choose, setMode, setTempoScale }
}
