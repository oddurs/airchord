import { KEYS, buildChord, type Chord, type Key } from './chords.ts'

/**
 * One bar, one chord. Songs are stored as *degrees*, never as note names, which
 * is what lets the key selector transpose one for free — and is also the only
 * honest way to write them down, since the instrument plays degrees.
 */
export interface Bar {
  degree: number
  major: boolean
}

export type Kit = 'rock' | 'click' | 'none'

/**
 * What a song is allowed to be: seven degrees, major or minor by lean. No sus
 * chords, no slash chords, no roots outside the key. A song that does not fit
 * is rejected rather than approximated — a wrong chord taught confidently costs
 * more than a missing song, because the player will trust it over their ear.
 */
export interface Song {
  id: string
  title: string
  artist: string
  /** The key it is canonically in. Choosing the song chooses it. */
  key: string
  bpm: number
  beatsPerBar: number
  countInBars: number
  kit: Kit
  bars: Bar[]
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

export const SONGS: Song[] = [
  {
    id: 'creep',
    title: 'Creep',
    artist: 'Radiohead',
    key: 'G',
    bpm: 92,
    beatsPerBar: 4,
    countInBars: 1,
    kit: 'rock',
    // Four bars, and they never change: verse, chorus and bridge are all this.
    // Both chords from outside the key are quality flips of degrees already
    // under the hand, which is the whole reason this is playable at all.
    bars: [I, III, IV, iv],
    link: 'https://www.radiohead.com',
    teaches: 'One, three and four fingers, and the wrist flip from IV to iv',
  },
  {
    id: 'zombie',
    title: 'Zombie',
    artist: 'The Cranberries',
    key: 'G',
    bpm: 84,
    beatsPerBar: 4,
    countInBars: 1,
    kit: 'rock',
    // vi IV I V. The horns pose, and a minor lean that has to survive it.
    bars: [vi, IV, I, V],
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
    kit: 'rock',
    bars: [I, V, vi, IV],
    link: 'https://www.u2.com',
    teaches: 'Every finger count in one loop, at a tempo that does not wait',
  },
]

export function songById(id: string): Song | null {
  return SONGS.find((s) => s.id === id) ?? null
}

export function keyOf(song: Song): Key {
  const key = KEYS.find((k) => k.name === song.key)
  if (!key) throw new Error(`Song ${song.id} is in ${song.key}, which the instrument cannot play`)
  return key
}

/** Root position, because every song here is accompaniment. */
export function chordOf(key: Key, bar: Bar): Chord {
  const chord = buildChord(key, { degree: bar.degree, major: bar.major, voicing: 1, octaveDown: false })
  if (!chord) throw new Error(`Bar has no degree`)
  return chord
}
