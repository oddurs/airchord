import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KEYS,
  buildChord,
  degreeFromFingers,
  isLeaned,
  majorFor,
  neutralRollFor,
  voicingFromFingers,
  type Gesture,
} from './chords.ts'
import type { Fingers } from './vision.ts'

const E = KEYS.find((k) => k.name === 'E')!
const hand = (thumb: boolean, index: boolean, middle: boolean, ring: boolean, pinky: boolean): Fingers =>
  [thumb, index, middle, ring, pinky]

const play = (over: Partial<Gesture> = {}) =>
  buildChord(E, { degree: 1, major: true, voicing: 1, octave: 0, ...over })!

const ratio = (a: number, b: number) => Math.round(12 * Math.log2(a / b))

test('degrees I-V come from the finger count', () => {
  assert.equal(degreeFromFingers(hand(false, true, false, false, false)), 1)
  assert.equal(degreeFromFingers(hand(false, true, true, false, false)), 2)
  assert.equal(degreeFromFingers(hand(true, true, true, true, true)), 5)
})

test('VI and VII are matched as shapes, not counts', () => {
  // Devil horns and a two-finger point both have two fingers up.
  assert.equal(degreeFromFingers(hand(false, true, false, false, true)), 6)
  assert.equal(degreeFromFingers(hand(true, true, false, false, true)), 7)
  assert.equal(degreeFromFingers(hand(false, true, true, false, false)), 2)
})

test('a closed hand is silence, not a chord', () => {
  assert.equal(degreeFromFingers(hand(false, false, false, false, false)), null)
  assert.equal(buildChord(E, { degree: null, major: true, voicing: 1, octave: 0 }), null)
})

test('the right hand counts fingers without the thumb, clamped to a voicing', () => {
  assert.equal(voicingFromFingers(hand(true, true, false, false, false)), 1)
  assert.equal(voicingFromFingers(hand(true, true, true, true, true)), 4)
  assert.equal(voicingFromFingers(hand(true, false, false, false, false)), 1)
})

test('degree VII is the subtonic below the tonic, not the leading tone above', () => {
  const tonic = play({ degree: 1 }).freqs[0]
  const seventh = play({ degree: 7 }).freqs[0]
  assert.equal(ratio(seventh, tonic), -1)
})

test('root position is spread: no close third, doubled at the octave', () => {
  const { freqs } = play({ voicing: 1 })
  assert.equal(freqs.length, 4)
  assert.deepEqual(freqs.map((f) => ratio(f, freqs[0])), [0, 7, 12, 16])
})

test('voicings follow the left hand into minor', () => {
  const major7 = play({ voicing: 3 })
  const minor7 = play({ voicing: 3, major: false })
  assert.deepEqual(major7.freqs.map((f) => ratio(f, major7.freqs[0])), [0, 4, 7, 11])
  assert.deepEqual(minor7.freqs.map((f) => ratio(f, minor7.freqs[0])), [0, 3, 7, 10])

  const dim = play({ voicing: 4, major: false })
  assert.deepEqual(dim.freqs.map((f) => ratio(f, dim.freqs[0])), [0, 3, 6, 9])
})

test('the register transposes the whole chord by an octave', () => {
  const normal = play()
  const low = play({ octave: -1 })
  assert.equal(ratio(low.freqs[0], normal.freqs[0]), -12)
  assert.equal(low.octave, -1)
  assert.equal(normal.octave, 0)
})

test('the sharp keys sit an octave down so they do not turn shrill', () => {
  for (const name of ['F#/Gb', 'G', 'G#/Ab']) {
    const key = KEYS.find((k) => k.name === name)!
    assert.ok(key.root < KEYS.find((k) => k.name === 'F')!.root, `${name} should be below F`)
  }
})

test('roman numerals report the quality the hand chose, not the key', () => {
  // Degree IV is diatonically major; leaning the hand borrows the minor.
  assert.equal(play({ degree: 4 }).numeral, 'IV')
  assert.equal(play({ degree: 4, major: false }).numeral, 'iv')
  assert.equal(play({ degree: 4, major: false }).name, 'Am')
  assert.equal(play({ degree: 3 }).name, 'G#')
})

// Roll values measured from real footage of the source performance. The first
// build read the minor frame as major, which is the bug these pin.
const MEASURED = { E: 0.065, Gsharp: 0.055, A: 0.18, Am: -0.115 }

test('the lean threshold separates the majors from the minor in real footage', () => {
  // Degrees matter now: lean is read against where an upright hand sits for the
  // pose being made, which is not the same angle for one finger and for four.
  // Upright reads as not leaned, whatever the degree.
  assert.equal(isLeaned(MEASURED.E, 1, false), false)
  assert.equal(isLeaned(MEASURED.Gsharp, 3, false), false)
  assert.equal(isLeaned(MEASURED.A, 4, false), false)
  assert.equal(isLeaned(MEASURED.Am, 4, false), true, 'a rolled hand must register as leaned')
})

test('the lean holds its last state inside the dead band', () => {
  // The band sits below zero, because a hand held upright reads positive roll.
  // Zero is therefore already a major reading, not an undecided one — which is
  // the whole point: straightening up must escape minor.
  const neutral = neutralRollFor(1)
  assert.equal(isLeaned(neutral, 1, true), false, 'upright stops being leaned')
  // Upright hands vary by up to 0.054 below neutral, and every one of those must
  // still read upright — so the ambiguous band sits well below, not around, it.
  assert.equal(isLeaned(neutral - 0.054, 1, true), false, 'the lowest upright frame still reads upright')
  assert.equal(isLeaned(neutral - 0.12, 1, true), true, 'inside the band, still leaned')
  assert.equal(isLeaned(neutral - 0.12, 1, false), false, 'inside the band, still upright')
  // A decisive move always wins, whichever way it was before.
  assert.equal(isLeaned(neutral - 0.25, 1, false), true)
  assert.equal(isLeaned(neutral + 0.2, 1, true), false)
})

test('no left hand means no lean', () => {
  assert.equal(isLeaned(null, null, true), false)
})

test('upright plays the chord the key expects, and leaning borrows the other', () => {
  // Two fingers in E is degree II, which is F# *minor* in that key. Defaulting
  // every degree to major is what made most of a key sound wrong.
  assert.equal(majorFor(1, false), true, 'I is major')
  assert.equal(majorFor(2, false), false, 'ii is minor')
  assert.equal(majorFor(3, false), false, 'iii is minor')
  assert.equal(majorFor(4, false), true, 'IV is major')
  assert.equal(majorFor(5, false), true, 'V is major')
  assert.equal(majorFor(6, false), false, 'vi is minor')
  // Leaning borrows: it flips whatever the degree is in the key.
  assert.equal(majorFor(2, true), true, 'a leaned ii borrows II')
  assert.equal(majorFor(4, true), false, 'a leaned IV borrows iv')
})

test('a thumb alone is never a chord', () => {
  // Reported from play: closing both fists kept a chord sounding. A fist reads
  // the thumb as extended, and counting alone then made it degree I.
  assert.equal(degreeFromFingers(hand(true, false, false, false, false)), null)
  assert.equal(degreeFromFingers(hand(false, false, false, false, false)), null)
})

test('the thumb still counts once a real finger is up', () => {
  assert.equal(degreeFromFingers(hand(true, true, false, false, false)), 2)
  assert.equal(degreeFromFingers(hand(true, true, true, true, true)), 5)
})
