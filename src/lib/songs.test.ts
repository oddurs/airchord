import test from 'node:test'
import assert from 'node:assert/strict'
import { KEYS, buildChord, degreeFromFingers } from './chords.ts'
import { SONGS, arrange, bar, chordOf, keyOf, lengthOf, loopOf, numeralOf, songById } from './songs.ts'
import { fingersForDegree } from './pose.ts'

const creep = songById('creep')!

test('Creep is four bars of I III IV iv, and nothing else', () => {
  assert.deepEqual(
    loopOf(creep).flatMap((p) => p.bar.map((c) => `${c.degree}${c.major ? '' : 'm'}`)),
    ['1', '3', '4', '4m'],
  )
})

test('a song is stored as degrees, so the key selector transposes it', () => {
  const names = (key: string) =>
    loopOf(creep).flatMap((p) => p.bar.map((c) => chordOf(KEYS.find((k) => k.name === key)!, c).name))

  assert.deepEqual(names('G'), ['G', 'B', 'C', 'Cm'])
  // The four reference frames of S6, which are this progression in E.
  assert.deepEqual(names('E'), ['E', 'G#', 'A', 'Am'])
})

test('a bar is one chord, or several with the beat each arrives on', () => {
  assert.deepEqual(bar({ degree: 1, major: true }), [{ beat: 0, degree: 1, major: true }])
  assert.deepEqual(bar({ degree: 1, major: true }, [2, { degree: 5, major: true }]), [
    { beat: 0, degree: 1, major: true },
    { beat: 2, degree: 5, major: true },
  ])
})

test('sections and repeats flatten into the bars that get played', () => {
  const played = arrange(creep)
  assert.equal(played.length, lengthOf(creep))
  assert.equal(played[0].section.name, 'Intro')
  assert.equal(played.at(-1)!.section.name, 'Outro')
  assert.ok(played.at(-1)!.lastOfSection, 'the song ends on a section boundary')

  // A section repeated twice is eight bars, and only its last one is the last.
  const verse = played.filter((p) => p.section === creep.sections[1])
  assert.equal(verse.length, 8)
  assert.deepEqual(verse.map((p) => p.lastOfSection), [...Array(7).fill(false), true])
})

test('Learn mode walks the distinct bars, not the whole arrangement', () => {
  // Every section of Creep is the same four bars, so there are four to learn.
  assert.equal(loopOf(creep).length, 4)
  assert.ok(arrange(creep).length > 40)
})

test('a song prints its numerals against its own tonic', () => {
  const zombie = songById('zombie')!
  const numerals = loopOf(zombie).flatMap((p) => p.bar.map((c) => numeralOf(zombie, c)))
  // Stored as degrees of G for the fingers; written as E minor, which is the key
  // a musician would say it is in.
  assert.deepEqual(numerals, ['i', 'VI', 'III', 'VII'])
  assert.deepEqual(
    loopOf(creep).flatMap((p) => p.bar.map((c) => numeralOf(creep, c))),
    ['I', 'III', 'IV', 'iv'],
  )
})

test('every song is playable by the instrument that has to play it', () => {
  for (const song of SONGS) {
    const key = keyOf(song)
    assert.ok(song.sections.length > 0, `${song.id} has no sections`)
    assert.ok(song.swing >= 0 && song.swing <= 1)
    for (const placed of arrange(song)) {
      assert.ok(placed.bar.length > 0, `${song.id} has an empty bar`)
      assert.equal(placed.bar[0].beat, 0, 'every bar starts with a chord')
      for (const change of placed.bar) {
        assert.ok(change.beat >= 0 && change.beat < song.beatsPerBar)
        assert.ok(change.degree >= 1 && change.degree <= 7, `${song.id} asks for degree ${change.degree}`)
        assert.equal(degreeFromFingers(fingersForDegree(change.degree)), change.degree)
        assert.equal(chordOf(key, change).freqs.length, 4)
      }
    }
  }
})

test('a key the instrument does not have is refused rather than approximated', () => {
  assert.throws(() => keyOf({ ...SONGS[0], key: 'H' }), /cannot play/)
})

test('the chord a change names is the chord the instrument would build', () => {
  const key = keyOf(creep)
  const change = { beat: 0, degree: 4, major: false }
  assert.deepEqual(
    chordOf(key, change).freqs,
    buildChord(key, { degree: 4, major: false, voicing: 1, octave: 0 })!.freqs,
  )
})
