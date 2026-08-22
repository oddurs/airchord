/**
 * Four voices, as parameter sets.
 *
 * "Warm / Bright / Retro" were `triangle / sawtooth / square` with nicer names:
 * the same graph every time, one oscillator type swapped. Everything that
 * actually gives an instrument a character — how far the unison spreads, how
 * much sub is under it, how hard the saturator is driven, where the filter sits,
 * how wet it is, and above all how it behaves when it is struck — was a constant
 * tuned once and never varied.
 *
 * These are honest synthesised approximations, not samples. The names say what
 * they are reaching for, not what they are.
 */

export type TimbreId = 'felt' | 'glass' | 'nylon' | 'organ'

export interface Timbre {
  id: TimbreId
  name: string
  /** One line, shown under the name. */
  note: string
  wave: OscillatorType
  /** Unison spread. Wide shimmers; tight is solid. */
  detuneCents: number
  /** Slow drift on top of it, so a held chord breathes. */
  driftCents: number
  /** An octave below the root, the body of the sound. */
  sub: number
  /** Saturator drive. Above about 2 it stops being colour and starts being fuzz. */
  drive: number
  /** Chord-change crossfade: short reads percussive, long reads legato. */
  fade: number
  filter: {
    centre: number
    q: number
    inwardHz: number
    inwardQ: number
    outwardHz: number
    outwardQ: number
    /** How much the cutoff follows the chord root, so high voicings stay bright. */
    keyTrack: number
  }
  /**
   * How the kit sounds under this voice. A backing beat that ignores the
   * instrument it is under is a drum machine in the next room; these are the
   * few numbers that make it the same record.
   */
  kit: {
    /** Where the kick falls to, and how long it takes. */
    kickHz: number
    kickDecay: number
    snareHz: number
    snareQ: number
    snareDecay: number
    hatHz: number
    hatDecay: number
    level: number
    /** How much of the kit goes into the same room as the chords. */
    room: number
  }
  /** The room. Length is shared — swapping the impulse response mid-note clicks,
   *  and wet plus pre-delay carry most of the difference anyway. */
  reverb: { wet: number; preDelay: number }
  /**
   * What a strike does. This is where the four voices differ most: a struck
   * felt hammer, a pad that barely notices, a string plucked and left to ring,
   * and an organ key that is simply down or up.
   */
  strike: {
    /** How long the duck into the hit takes. */
    duck: number
    /** How far down it ducks. Low is percussive; high barely articulates. */
    depth: number
    attack: number
    /** How long it takes to come back. Long reads as a decay. */
    settle: number
    /** Between voices, low to high. Zero is a keyboard; wide is a hand crossing strings. */
    spread: number
  }
}

export const TIMBRES: Timbre[] = [
  {
    id: 'felt',
    name: 'Felt',
    note: 'Hammered and soft',
    wave: 'triangle',
    detuneCents: 4,
    driftCents: 2,
    sub: 0.26,
    drive: 1.3,
    fade: 0.012,
    filter: { centre: 900, q: 0.7, inwardHz: 700, inwardQ: 1.4, outwardHz: 3000, outwardQ: 3.6, keyTrack: 0.4 },
    // Low and soft, a brush rather than a stick, and enough room to sit with a
    // hammered chord without either one arriving first.
    kit: { kickHz: 42, kickDecay: 0.3, snareHz: 1400, snareQ: 1.2, snareDecay: 0.14, hatHz: 6000, hatDecay: 0.05, level: 0.3, room: 0.12 },
    reverb: { wet: 0.24, preDelay: 0.022 },
    // Deep and fast, recovering slowly: the shape of something struck.
    strike: { duck: 0.014, depth: 0.1, attack: 0.004, settle: 0.34, spread: 0.006 },
  },
  {
    id: 'glass',
    name: 'Glass',
    note: 'Wide and slow',
    wave: 'triangle',
    detuneCents: 13,
    driftCents: 5,
    sub: 0.14,
    drive: 1.15,
    fade: 0.05,
    filter: { centre: 2400, q: 0.9, inwardHz: 1600, inwardQ: 1.2, outwardHz: 5200, outwardQ: 4, keyTrack: 0.25 },
    // Airy and washed: the snare is more splash than crack, and a quarter of it
    // goes into the room the pad is already filling.
    kit: { kickHz: 38, kickDecay: 0.26, snareHz: 2100, snareQ: 0.7, snareDecay: 0.22, hatHz: 9000, hatDecay: 0.06, level: 0.24, room: 0.24 },
    reverb: { wet: 0.38, preDelay: 0.045 },
    // Ducks lightly and swells back: a pad notices the beat rather than marking
    // it. It was shallower still, at 0.55, until the measurement pointed out
    // that a duck that shallow is not distinguishable from no duck at all —
    // across machines, and therefore to a listener.
    strike: { duck: 0.03, depth: 0.4, attack: 0.05, settle: 0.5, spread: 0.03 },
  },
  {
    id: 'nylon',
    name: 'Nylon',
    note: 'Plucked and dry',
    wave: 'sawtooth',
    detuneCents: 6,
    driftCents: 2.5,
    sub: 0.1,
    drive: 1.8,
    fade: 0.008,
    filter: { centre: 1500, q: 0.8, inwardHz: 900, inwardQ: 1.8, outwardHz: 4200, outwardQ: 5, keyTrack: 0.5 },
    // Dry and close, almost no room at all — the same choice as the voice.
    kit: { kickHz: 50, kickDecay: 0.18, snareHz: 1900, snareQ: 1.4, snareDecay: 0.1, hatHz: 8000, hatDecay: 0.03, level: 0.32, room: 0.05 },
    reverb: { wet: 0.14, preDelay: 0.012 },
    // The deepest duck, the fastest attack, the longest ring-down, and the
    // widest spread — the notes arrive one after another, as a hand does.
    strike: { duck: 0.01, depth: 0.06, attack: 0.003, settle: 0.55, spread: 0.026 },
  },
  {
    id: 'organ',
    name: 'Organ',
    note: 'Steady and stacked',
    wave: 'square',
    detuneCents: 2,
    driftCents: 0.8,
    sub: 0.34,
    drive: 1.5,
    fade: 0.006,
    filter: { centre: 1800, q: 0.6, inwardHz: 1100, inwardQ: 1, outwardHz: 4000, outwardQ: 3, keyTrack: 0.2 },
    // Punchy and even, the way a rhythm section behind an organ has to be.
    kit: { kickHz: 46, kickDecay: 0.22, snareHz: 1700, snareQ: 0.9, snareDecay: 0.16, hatHz: 7200, hatDecay: 0.045, level: 0.34, room: 0.1 },
    reverb: { wet: 0.16, preDelay: 0.018 },
    // A key is down or it is up. No spread at all, and back to full immediately.
    strike: { duck: 0.008, depth: 0.25, attack: 0.002, settle: 0.06, spread: 0 },
  },
]

export const DEFAULT_TIMBRE: TimbreId = 'felt'

export function timbreById(id: string): Timbre {
  return TIMBRES.find((t) => t.id === id) ?? TIMBRES.find((t) => t.id === DEFAULT_TIMBRE)!
}
