'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BeatBox, DEFAULT_BPM, signatureById, type Signature } from '@/lib/beat'
import { buildKit, type DrumKit } from '@/lib/drums'
import { recall, remember } from '@/lib/remember'
import { timbreById, type TimbreId } from '@/lib/timbre'

/**
 * The backing beat's lifetime. Three things move independently and none of them
 * should interrupt the others: whether it is playing, how fast, and what it
 * sounds like. Changing the voice re-voices the kit without stopping the beat —
 * the kit lives behind a ref that the scheduler reads at each hit, so a swap
 * lands on the next one.
 */

export function useBeat({
  audio,
  running,
  timbre,
}: {
  audio: () => import('@/lib/synth').AudioBridge | null
  running: boolean
  timbre: TimbreId
}) {
  const [signature, setSignatureState] = useState<string | null>(null)
  const [bpm, setBpmState] = useState(DEFAULT_BPM)

  const kitRef = useRef<DrumKit | null>(null)
  const boxRef = useRef<BeatBox | null>(null)

  useEffect(() => {
    setSignatureState(recall<string | null>('beat', null))
    setBpmState(recall('bpm', DEFAULT_BPM))
  }, [])

  // The kit follows the voice. Rebuilt rather than retuned: it is a handful of
  // nodes, and the alternative is a setter for every number in the voicing.
  useEffect(() => {
    if (!running || !signature) return
    const bridge = audio()
    if (!bridge) return
    kitRef.current = buildKit(bridge.context, bridge.destination, {
      voicing: timbreById(timbre).kit,
      room: bridge.room,
    })
    return () => {
      kitRef.current?.dispose()
      kitRef.current = null
    }
  }, [running, signature, timbre, audio])

  useEffect(() => {
    if (!running || !signature) return
    const bridge = audio()
    if (!bridge) return
    const box = new BeatBox({
      clock: () => bridge.context.currentTime,
      play: (voice, time, gain) => kitRef.current?.trigger(voice, time, gain),
    })
    boxRef.current = box
    box.start(signatureById(signature), bpm)
    return () => {
      box.stop()
      boxRef.current = null
    }
    // bpm is deliberately absent: changing it must not restart the beat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, signature, audio])

  useEffect(() => {
    boxRef.current?.setBpm(bpm)
  }, [bpm])

  useEffect(() => {
    if (signature) boxRef.current?.setSignature(signatureById(signature))
  }, [signature])

  const setSignature = useCallback((id: string | null) => {
    setSignatureState(id)
    remember('beat', id)
  }, [])

  const setBpm = useCallback((next: number) => {
    setBpmState(next)
    remember('bpm', next)
  }, [])

  return { signature, bpm, setSignature, setBpm, playing: Boolean(signature) && running }
}

export type { Signature }
