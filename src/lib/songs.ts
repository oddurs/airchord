import { KEYS, buildChord, numeralAt, type Chord, type Key } from './chords.ts'

/**
 * A chord change, at the beat of the bar it arrives on. Songs are stored as
 * *degrees*, never as note names, which is what lets the key selector transpose
 * one for free — and is the only honest way to write them down, since the
 * instrument plays degrees.
 */
export interface Change {
  beat: number
  degree: number
  major: boolean
}

export type Degree = { degree: number; major: boolean }

/** A bar: its changes, in order, the first of them on the downbeat. */
export type Bar = Change[]

/**
 * One chord for the bar, or several with the beat each one arrives on:
 * `bar(I)` · `bar(I, [2, V])`.
 */
export function bar(first: Degree, ...rest: [number, Degree][]): Bar {
  return [{ beat: 0, ...first }, ...rest.map(([beat, degree]) => ({ beat, ...degree }))]
}

/**
 * How hard a section is played. Sections are not the same music at different
 * volumes — a chorus is a different pattern from the verse before it, and Creep's
 * drums do not enter until the song is already a minute old.
 */
export type Intensity = 'silent' | 'sparse' | 'full' | 'lift'

export interface Section {
  name: string
  bars: Bar[]
  /** Times through. One if absent. */
  repeats?: number
  intensity: Intensity
}

export interface TempoMark {
  /** Bar of the arrangement the new tempo takes effect on. */
  bar: number
  bpm: number
}

/**
 * What a song is allowed to be: seven degrees, major or minor by lean. No sus
 * chords, no slash chords, no roots outside the key. A song that does not fit is
 * rejected rather than approximated — a wrong chord taught confidently costs
 * more than a missing song, because the player will trust it over their ear.
 */
export interface Song {
  id: string
  title: string
  artist: string
  /** The key it is canonically in. Choosing the song chooses it. */
  key: string
  /**
   * The degree the song actually sits on, when that is not the key's own tonic.
   * Zombie is in E minor; storing it as degrees of G is right for the fingers
   * and wrong on the page, where a musician writes `i VI III VII`. This moves
   * the *numerals* onto the song's tonic and leaves the fingering alone.
   */
  tonic?: number
  bpm: number
  /** Tempo changes, if the song has any. The base tempo is `bpm`. */
  tempoChanges?: TempoMark[]
  beatsPerBar: number
  countInBars: number
  /** 0 straight, 1 fully triplet. Between is where most music lives. */
  swing: number
  sections: Section[]
  /** Where to hear the original. Progressions are not the copyrightable part of
   *  a song; lyrics, melody and recordings are, and none of them ship here. */
  link: string
  /** What this song is for, in the ladder of poses. */
  teaches: string
}

const I = { degree: 1, major: true }
const III = { degree: 3, major: true }
const IV = { degree: 4, major: true }
const iv = { degree: 4, major: false }
const V = { degree: 5, major: true }
const vi = { degree: 6, major: false }

/**
 * The arrangements below are playable structures rather than transcriptions:
 * the chords are the songs' own, the section lengths are musically sensible and
 * have not been checked bar-for-bar against a recording. Marked here so nobody
 * later mistakes them for measurements.
 */
const CREEP = [bar(I), bar(III), bar(IV), bar(iv)]
const ZOMBIE = [bar(vi), bar(IV), bar(I), bar(V)]
const AXIS = [bar(I), bar(V), bar(vi), bar(IV)]

export const SONGS: Song[] = [
  {
    id: 'creep',
    title: 'Creep',
    artist: 'Radiohead',
    key: 'G',
    bpm: 92,
    beatsPerBar: 4,
    countInBars: 1,
    swing: 0,
    // Four bars, and they never change: verse, chorus and bridge are all this
    // loop. Both chords from outside the key are quality flips of degrees
    // already under the hand, which is why it is playable at all.
    sections: [
      { name: 'Intro', bars: CREEP, intensity: 'silent' },
      { name: 'Verse', bars: CREEP, repeats: 2, intensity: 'sparse' },
      { name: 'Chorus', bars: CREEP, repeats: 2, intensity: 'full' },
      { name: 'Verse', bars: CREEP, repeats: 2, intensity: 'sparse' },
      { name: 'Chorus', bars: CREEP, repeats: 2, intensity: 'full' },
      { name: 'Bridge', bars: CREEP, repeats: 2, intensity: 'lift' },
      { name: 'Chorus', bars: CREEP, repeats: 2, intensity: 'full' },
      { name: 'Outro', bars: CREEP, intensity: 'sparse' },
    ],
    link: 'https://www.radiohead.com',
    teaches: 'One, three and four fingers, and the wrist flip from IV to iv',
  },
  {
    id: 'zombie',
    title: 'Zombie',
    artist: 'The Cranberries',
    key: 'G',
    tonic: 6,
    bpm: 84,
    beatsPerBar: 4,
    countInBars: 1,
    swing: 0,
    sections: [
      { name: 'Intro', bars: ZOMBIE, intensity: 'silent' },
      { name: 'Verse', bars: ZOMBIE, repeats: 2, intensity: 'sparse' },
      { name: 'Chorus', bars: ZOMBIE, repeats: 2, intensity: 'lift' },
      { name: 'Verse', bars: ZOMBIE, repeats: 2, intensity: 'sparse' },
      { name: 'Chorus', bars: ZOMBIE, repeats: 2, intensity: 'lift' },
      { name: 'Outro', bars: ZOMBIE, intensity: 'full' },
    ],
    link: 'https://www.cranberries.com',
    teaches: 'The VI horns, and five fingers for V',
  },
  {
    id: 'with-or-without-you',
    title: 'With or Without You',
    artist: 'U2',
    key: 'D',
    bpm: 110,
    beatsPerBar: 4,
    countInBars: 1,
    swing: 0,
    sections: [
      { name: 'Intro', bars: AXIS, repeats: 2, intensity: 'silent' },
      { name: 'Verse', bars: AXIS, repeats: 2, intensity: 'sparse' },
      { name: 'Chorus', bars: AXIS, repeats: 2, intensity: 'full' },
      { name: 'Verse', bars: AXIS, repeats: 2, intensity: 'sparse' },
      { name: 'Build', bars: AXIS, repeats: 2, intensity: 'lift' },
      { name: 'Outro', bars: AXIS, intensity: 'sparse' },
    ],
    link: 'https://www.u2.com',
    teaches: 'Every finger count in one loop, at a tempo that does not wait',
  },
]

/** One bar of the arrangement, and where it sits in the song. */
export interface Placed {
  bar: Bar
  index: number
  section: Section
  /** Which run through this section, and how far into it. */
  barInSection: number
  lastOfSection: boolean
}

/**
 * Sections and repeats flattened into the bars that will actually be played.
 * Everything downstream — the clock, the lane, the grader — walks this list, so
 * a song has a beginning and an end rather than being a loop with no edges.
 */
export function arrange(song: Song): Placed[] {
  const placed: Placed[] = []
  for (const section of song.sections) {
    const times = section.repeats ?? 1
    const length = section.bars.length * times
    for (let n = 0; n < length; n++) {
      placed.push({
        bar: section.bars[n % section.bars.length],
        index: placed.length,
        section,
        barInSection: n,
        lastOfSection: n === length - 1,
      })
    }
  }
  return placed
}

export function songById(id: string): Song | null {
  return SONGS.find((s) => s.id === id) ?? null
}

export function keyOf(song: Song): Key {
  const key = KEYS.find((k) => k.name === song.key)
  if (!key) throw new Error(`Song ${song.id} is in ${song.key}, which the instrument cannot play`)
  return key
}

/** Root position, because every song here is accompaniment. */
export function chordOf(key: Key, change: Degree): Chord {
  const chord = buildChord(key, { degree: change.degree, major: change.major, voicing: 1, octaveDown: false })
  if (!chord) throw new Error('A change with no degree')
  return chord
}

/** The numeral as the song's own key signature would write it. */
export function numeralOf(song: Song, change: Degree): string {
  const step = (((change.degree - (song.tonic ?? 1)) % 7) + 7) % 7
  return numeralAt(step, change.major)
}

/** Total bars, count-in excluded. */
export function lengthOf(song: Song): number {
  return song.sections.reduce((n, s) => n + s.bars.length * (s.repeats ?? 1), 0)
}
