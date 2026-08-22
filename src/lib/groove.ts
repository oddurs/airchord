import type { Intensity } from './songs.ts'

/**
 * The feel. A pattern belongs to a *section*, not to a song: a chorus is not the
 * verse played louder, it is a different pattern, and the last bar before a
 * section boundary is a fill rather than the pattern again.
 */

export type Voice = 'kick' | 'snare' | 'hat' | 'crash'

/** Anything that happens at a fractional beat of the bar. */
export interface Event {
  beat: number
}

export interface Hit extends Event {
  voice: Voice
  gain: number
}

/** A re-articulation of whatever chord the player is holding. */
export interface Strum extends Event {
  velocity: number
}

export interface Groove {
  drums: Hit[]
  /** Played instead of `drums` on the last bar before a section changes. */
  fill: Hit[]
  strum: Strum[]
}

const hats = (gain: number, beats = 4, step = 0.5): Hit[] =>
  Array.from({ length: Math.round(beats / step) }, (_, i) => ({
    beat: i * step,
    voice: 'hat' as Voice,
    // Offbeats sit under the beats they fall between, or the bar has no pulse.
    gain: gain * ((i * step) % 1 === 0 ? 1 : 0.62),
  }))

/**
 * Four intensities, and the difference between them is arrangement rather than
 * volume. `silent` still strums: an intro with no drums is not an intro with no
 * instrument.
 */
export const GROOVES: Record<Intensity, Groove> = {
  silent: {
    drums: [],
    fill: [],
    strum: [{ beat: 0, velocity: 0.85 }],
  },
  sparse: {
    drums: [
      { beat: 0, voice: 'kick', gain: 0.9 },
      { beat: 2, voice: 'snare', gain: 0.8 },
      ...hats(0.24, 4, 1),
    ],
    fill: [
      { beat: 0, voice: 'kick', gain: 0.9 },
      { beat: 2, voice: 'snare', gain: 0.8 },
      { beat: 3.5, voice: 'snare', gain: 0.7 },
    ],
    strum: [
      { beat: 0, velocity: 1 },
      { beat: 2, velocity: 0.8 },
    ],
  },
  full: {
    drums: [
      { beat: 0, voice: 'kick', gain: 1 },
      { beat: 1, voice: 'snare', gain: 0.9 },
      { beat: 2.5, voice: 'kick', gain: 0.85 },
      { beat: 3, voice: 'snare', gain: 0.9 },
      ...hats(0.3),
    ],
    fill: [
      { beat: 0, voice: 'kick', gain: 1 },
      { beat: 1, voice: 'snare', gain: 0.9 },
      ...hats(0.3, 3),
      // Four sixteenths into the change, getting louder.
      { beat: 3, voice: 'snare', gain: 0.6 },
      { beat: 3.25, voice: 'snare', gain: 0.7 },
      { beat: 3.5, voice: 'snare', gain: 0.85 },
      { beat: 3.75, voice: 'snare', gain: 1 },
    ],
    strum: [
      { beat: 0, velocity: 1 },
      { beat: 1.5, velocity: 0.7 },
      { beat: 2, velocity: 0.85 },
      { beat: 3.5, velocity: 0.7 },
    ],
  },
  lift: {
    drums: [
      { beat: 0, voice: 'kick', gain: 1 },
      { beat: 1, voice: 'snare', gain: 1 },
      { beat: 1.5, voice: 'kick', gain: 0.7 },
      { beat: 2.5, voice: 'kick', gain: 0.9 },
      { beat: 3, voice: 'snare', gain: 1 },
      ...hats(0.4),
    ],
    fill: [
      { beat: 0, voice: 'kick', gain: 1 },
      { beat: 1, voice: 'snare', gain: 1 },
      { beat: 2, voice: 'snare', gain: 0.7 },
      { beat: 2.5, voice: 'snare', gain: 0.8 },
      { beat: 3, voice: 'snare', gain: 0.85 },
      { beat: 3.5, voice: 'snare', gain: 1 },
    ],
    strum: [
      { beat: 0, velocity: 1 },
      { beat: 1, velocity: 0.8 },
      { beat: 2, velocity: 0.95 },
      { beat: 3, velocity: 0.8 },
    ],
  },
}

/** Every beat, accented on the one, so a bar is countable. */
export const COUNT_IN: Hit[] = Array.from({ length: 4 }, (_, beat) => ({
  beat,
  voice: 'hat' as Voice,
  gain: beat === 0 ? 0.85 : 0.45,
}))

/** Lands on the downbeat a section starts on. */
export const SECTION_CRASH: Hit = { beat: 0, voice: 'crash', gain: 0.8 }

/**
 * Swing, applied to the offbeat eighths only. A perfectly quantised kit is most
 * of why a metronome sounds like a metronome; 0 is straight and 1 is a full
 * triplet, and almost everything real sits between.
 */
export function swung(beat: number, swing: number): number {
  const offbeat = Math.abs((beat % 1) - 0.5) < 1e-9
  return offbeat ? beat + swing / 6 : beat
}

/** The events landing inside one beat, with their offset into it. */
export function eventsOn<T extends Event>(events: T[], beat: number, swing = 0): { event: T; offset: number }[] {
  return events
    .map((event) => ({ event, at: swung(event.beat, swing) }))
    .filter(({ at }) => Math.floor(at) === beat)
    .map(({ event, at }) => ({ event, offset: at - beat }))
}
