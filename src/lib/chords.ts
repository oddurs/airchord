import type { Fingers } from './features.ts'

export interface Key {
  name: string
  /** MIDI note of the tonic. */
  root: number
  /** Note spellings of the seven scale degrees. */
  degrees: string[]
}

/**
 * One octave band, A3 upward — except F#/G/G#, which sit an octave lower so the
 * top of the circle doesn't turn shrill. That register drop is baked into the
 * table rather than applied as a rule; it is data, not logic.
 */
export const KEYS: Key[] = [
  { name: 'A',     root: 57, degrees: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
  { name: 'A#/Bb', root: 58, degrees: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'] },
  { name: 'B',     root: 59, degrees: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'] },
  { name: 'C',     root: 60, degrees: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  { name: 'C#/Db', root: 61, degrees: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'] },
  { name: 'D',     root: 62, degrees: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
  { name: 'D#/Eb', root: 63, degrees: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] },
  { name: 'E',     root: 64, degrees: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
  { name: 'F',     root: 65, degrees: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
  { name: 'F#/Gb', root: 54, degrees: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'] },
  { name: 'G',     root: 55, degrees: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
  { name: 'G#/Ab', root: 56, degrees: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'] },
]

/**
 * Semitones from the tonic for each degree. VII is -1: the leading tone, a
 * semitone *below* the tonic rather than a seventh above it. That octave
 * displacement is deliberate and easy to "correct" by mistake into something
 * that sounds wrong.
 *
 * (An earlier comment here called it the subtonic. It is not — a subtonic would
 * be -2, a whole tone below.)
 */
const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, -1]

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** A scale step as a numeral, cased by quality. Exported so a song can print
 *  its degrees against its own tonic rather than against the key's. */
export function numeralAt(step: number, major: boolean): string {
  return major ? NUMERALS[step] : NUMERALS[step].toLowerCase()
}

/**
 * Four voices, always. Root position is deliberately spread — it drops the close
 * third and doubles at the octave, which is most of why the instrument sounds
 * full rather than thin.
 */
const VOICINGS: Record<number, { major: number[]; minor: number[] }> = {
  1: { major: [0, 7, 12, 16], minor: [0, 7, 12, 15] },
  2: { major: [4, 7, 12, 16], minor: [3, 7, 12, 15] },
  3: { major: [0, 4, 7, 11],  minor: [0, 3, 7, 10] },
  4: { major: [0, 4, 7, 10],  minor: [0, 3, 6, 9] },
}

const QUALITY_NAMES: Record<number, [string, string]> = {
  1: ['Major', 'Minor'],
  2: ['Major 1st Inv', 'Minor 1st Inv'],
  3: ['Major 7th', 'Minor 7th'],
  4: ['Dominant 7th', 'Diminished 7th'],
}

export interface Gesture {
  degree: number | null
  major: boolean
  voicing: number
  /** -1 an octave down, 0 as written, +1 an octave up. */
  octave: number
}

export interface Chord {
  /** e.g. "E" */
  name: string
  /** e.g. "I" for major, "iv" for minor */
  numeral: string
  /** e.g. "Major" */
  quality: string
  /** -1 an octave down, 0 as written, +1 an octave up. */
  octave: number
  /** 1-7, for colour */
  degree: number
  /** 1-4, right-hand finger count */
  voicing: number
  major: boolean
  freqs: number[]
}

/**
 * Left-hand scale degree. Counting alone can't tell devil horns from a peace
 * sign, so the two spread shapes are matched by pattern first.
 */
export function degreeFromFingers([thumb, index, middle, ring, pinky]: Fingers): number | null {
  // A thumb on its own is not a chord. Without this, any pose that reads the
  // thumb as extended — a closed fist, most notably — plays the tonic, because
  // counting alone cannot tell a raised thumb from a raised finger.
  const others = [index, middle, ring, pinky].filter(Boolean).length
  if (others === 0) return null

  if (index && pinky && !middle && !ring) return thumb ? 7 : 6
  return others + (thumb ? 1 : 0)
}

/**
 * Major or minor from how the hand leans.
 *
 * A hand held upright does **not** read zero roll. Measured across the captured
 * dataset, a neutral left hand sits at +0.05 to +0.16 radians and a neutral
 * right hand at -0.11 — anatomy tilts the palm axis, in opposite directions for
 * the two hands. Neutral also varies by pose: a single raised finger reads
 * +0.054 where a fist reads +0.128.
 *
 * The band therefore sits *below* zero rather than straddling it. An earlier
 * version returned to major only above +0.045, which is inside the range a
 * neutral one-finger pose occupies — so after a minor chord, straightening into
 * a single finger held the previous answer and the chord stayed minor.
 *
 * These are one player's hands. Per-player calibration is the real answer.
 */
/**
 * Neutral roll for each degree, measured from the captured dataset with every
 * pose held upright. It is not one number: people hold a horns pose at a
 * genuinely different angle from a pointing finger, and across the seven poses
 * neutral moves by 0.11 radians — against a decision band 0.07 wide.
 *
 * That mismatch, not the threshold, is why this control kept reading minor on
 * an upright hand. Lean is therefore measured *relative to the pose being
 * made*, which collapses the spread to nothing.
 *
 * One player's hands. Calibration replaces this table rather than adjusting it.
 */
const NEUTRAL_ROLL = [0.054, 0.068, 0.072, 0.092, 0.086, 0.136, 0.162]

/**
 * The band sits below the *lowest* upright lean, not below the average one.
 *
 * Neutral has spread within a pose as well as between poses: a pointing finger
 * averages 0.054 but ranges down to 0.000, so a band centred on the average left
 * upright frames inside it, holding whatever quality was there before. That is
 * how an upright hand kept playing minor.
 *
 * Worst upright lean across the captured poses is -0.054, so the major
 * threshold clears it with margin, and minor still sits well within reach of a
 * deliberate roll (a measured minor lean reads about -0.21).
 */
const MINOR_ON = -0.16
const MINOR_OFF = -0.075

/** A calibrated band replaces the defaults once a player has measured their own. */
export interface LeanCalibration {
  /** Where this player's upright hand sits, relative to the built-in neutral. */
  offset: number
  /** Lean at which the hand counts as leaned, and at which it stops. */
  on: number
  off: number
}

export const DEFAULT_LEAN: LeanCalibration = { offset: 0, on: MINOR_ON, off: MINOR_OFF }

/** The same band, for anything that has to *draw* the decision. Exported rather
 *  than duplicated: a lean cue that disagrees with the lean is worse than none. */
export const LEAN_BAND = { minor: MINOR_ON, major: MINOR_OFF }

/** Where an upright hand sits for this degree, so lean can be measured from it. */
export function neutralRollFor(degree: number | null): number {
  if (degree === null) return NEUTRAL_ROLL[0]
  return NEUTRAL_ROLL[Math.min(NEUTRAL_ROLL.length, Math.max(1, degree)) - 1]
}

/**
 * How far the hand has leaned from upright *for the pose it is making*.
 *
 * `offset` is the player's own bias, measured by calibration. The table is one
 * person's hands recorded in one sitting, and where someone actually holds a
 * hand while playing differs from where they hold it while posing for a
 * capture — enough that an upright hand can read as leaned and the player ends
 * up rotating inward to compensate.
 */
export function leanOf(roll: number, degree: number | null, offset = 0): number {
  return roll - neutralRollFor(degree) - offset
}

/**
 * The quality each degree has in the key, before any lean.
 *
 * Defaulting every degree to major meant four of the seven — ii, iii, vi and the
 * subtonic's relative — came out wrong unless the player leaned for each one.
 * Two fingers in E gave F# major, which is not in E. Playing in a key should not
 * require fighting the instrument on more than half its chords.
 *
 * Degree VII sits on the leading tone, where the diatonic chord is diminished.
 * The instrument has no diminished triad at this voicing, and minor is much the
 * closer of the two available: against F#dim (F# A C), F#m shares two notes
 * where F# major shares one and adds an A# that is in no part of the key.
 */
const DIATONIC_MAJOR = [true, false, false, true, true, false, false]

export function diatonicMajor(degree: number | null): boolean {
  if (degree === null) return true
  return DIATONIC_MAJOR[Math.min(7, Math.max(1, degree)) - 1]
}

/** Whether the hand is leaned away from upright, for the pose it is making. */
export function isLeaned(
  roll: number | null,
  degree: number | null,
  wasLeaned: boolean,
  cal: LeanCalibration = DEFAULT_LEAN,
): boolean {
  if (roll === null) return false
  const lean = leanOf(roll, degree, cal.offset)
  if (lean < cal.on) return true
  if (lean > cal.off) return false
  return wasLeaned
}

/**
 * Turns two held samples into a band. Thresholds are placed between where this
 * player holds upright and where they actually lean, and scaled to that
 * distance — so a small lean and a theatrical one both work, and neither is
 * assumed. Falls back to the defaults if the two are too close to separate.
 */
export function calibrationFrom(upright: number[], leaned: number[]): LeanCalibration | null {
  if (upright.length < 15 || leaned.length < 15) return null
  const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const offset = mid(upright)
  const travel = mid(leaned) - offset
  // A lean must be a real move away from upright, and in the leaning direction.
  if (travel > -0.05) return null
  return { offset, on: travel * 0.55, off: travel * 0.28 }
}

/**
 * Lean *borrows*: it flips the degree away from the quality it has in the key.
 * Upright plays the chord the key expects; leaning gets you the other one, which
 * is the whole trick the instrument is for.
 */
export function majorFor(degree: number | null, leaned: boolean): boolean {
  return leaned ? !diatonicMajor(degree) : diatonicMajor(degree)
}

/** Right-hand voicing: the four non-thumb fingers. */
export function voicingFromFingers(fingers: Fingers): number {
  const count = fingers.slice(1).filter(Boolean).length
  return Math.min(4, Math.max(1, count))
}

export function buildChord(key: Key, g: Gesture): Chord | null {
  if (g.degree === null) return null

  const step = g.degree - 1
  const root = key.root + DEGREE_SEMITONES[step] + g.octave * 12
  const intervals = g.major ? VOICINGS[g.voicing].major : VOICINGS[g.voicing].minor
  const [majorName, minorName] = QUALITY_NAMES[g.voicing]

  return {
    name: key.degrees[step] + (g.major ? '' : 'm'),
    numeral: numeralAt(step, g.major),
    quality: g.major ? majorName : minorName,
    octave: g.octave,
    degree: g.degree,
    voicing: g.voicing,
    major: g.major,
    freqs: intervals.map((i) => midiToFreq(root + i)),
  }
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}
