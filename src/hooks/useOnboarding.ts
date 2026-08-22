'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Hud } from '@/lib/engine'
import { fingersForDegree, fingersForVoicing, type PoseTarget } from '@/lib/pose'
import { recall, remember } from '@/lib/remember'

/**
 * The first sixty seconds.
 *
 * Everything this instrument knows how to teach was locked inside song mode: the
 * ghost hand, the lean dial, waiting for the player rather than at them. Someone
 * arriving for the first time got a reference table instead — and a reference is
 * what you read *after* you understand. This is the same machinery, with no
 * chords to learn and nothing to read: it asks for one thing, shows it on your
 * own hand, and waits.
 *
 * It watches the HUD rather than the engine's commit callback, which the
 * practice session owns. Nothing here can take that away from a song.
 */

export interface Step {
  prompt: string
  /** The quiet second line. Never necessary to succeed. */
  aside?: string
  /** Drawn on the player's own hands, or nothing when the step is not a pose. */
  target: PoseTarget | null
  done: (hud: Hud) => boolean
}

const pose = (degree: number, major: boolean): PoseTarget => ({
  degree,
  major,
  fingers: fingersForDegree(degree),
  right: fingersForVoicing(1),
})

export const STEPS: Step[] = [
  {
    prompt: 'Raise one finger',
    aside: 'on your left hand',
    target: pose(1, true),
    done: (hud) => hud.numeral === 'I',
  },
  {
    prompt: 'Now three',
    aside: 'that is a different chord',
    target: pose(3, true),
    done: (hud) => hud.numeral === 'III',
  },
  {
    prompt: 'Keep three, and lean your hand outward',
    aside: 'the same chord, turned minor',
    target: pose(3, false),
    done: (hud) => hud.numeral === 'iii',
  },
  {
    prompt: 'Raise your right hand',
    aside: 'height is volume',
    target: null,
    done: (hud) => hud.hands >= 2 && hud.volume >= 0.55,
  },
  {
    prompt: 'Lower both hands',
    aside: 'that is how you stop',
    target: null,
    done: (hud) => hud.name === null,
  },
]

/** Long enough that a pose flickering past does not count as an answer. */
const HOLD_MS = 400
/** The closing line sits for a moment rather than vanishing mid-read. */
const FAREWELL_MS = 2600
const SEEN = 'tour'

export function useOnboarding({
  hud,
  running,
  setTarget,
}: {
  hud: Hud
  running: boolean
  setTarget: (target: PoseTarget | null) => void
}) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const hudRef = useRef(hud)
  hudRef.current = hud

  // First visit, or ?tour to see it again.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).has('tour')
    if (asked || !recall(SEEN, false)) setActive(true)
  }, [])

  const close = useCallback(() => {
    setActive(false)
    setTarget(null)
    remember(SEEN, true)
  }, [setTarget])

  const skip = useCallback(() => {
    setFinished(false)
    close()
  }, [close])

  useEffect(() => {
    if (!active || !running) return
    setTarget(finished ? null : (STEPS[index]?.target ?? null))
  }, [active, running, index, finished, setTarget])

  // The HUD only changes when something changes, so a pose held perfectly still
  // stops producing renders. The timer is what notices that it is still held.
  useEffect(() => {
    if (!active || !running || finished) return
    const step = STEPS[index]
    if (!step?.done(hudRef.current)) return
    const timer = setTimeout(() => {
      if (!step.done(hudRef.current)) return
      if (index + 1 < STEPS.length) setIndex(index + 1)
      else setFinished(true)
    }, HOLD_MS)
    return () => clearTimeout(timer)
  }, [hud, index, active, running, finished])

  useEffect(() => {
    if (!finished) return
    const timer = setTimeout(close, FAREWELL_MS)
    return () => clearTimeout(timer)
  }, [finished, close])

  return {
    active: active && running,
    finished,
    index,
    total: STEPS.length,
    step: STEPS[index],
    skip,
  }
}
