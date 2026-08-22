import test from 'node:test'
import assert from 'node:assert/strict'
import { KEYS, buildChord, degreeFromFingers } from './chords.ts'
import { SONGS, chordOf, keyOf, songById } from './songs.ts'
import { fingersForDegree } from './pose.ts'

test('Creep is four bars of I III IV iv, and nothing else', () => {
  const creep = songById('creep')!
  assert.deepEqual(
    creep.bars.map((b) => `${b.degree}${b.major ? '' : 'm'}`),
    ['1', '3', '4', '4m'],
  )
})

test('a song is stored as degrees, so the key selector transposes it', () => {
  const creep = songById('creep')!
  const names = (key: string) => creep.bars.map((b) => chordOf(KEYS.find((k) => k.name === key)!, b).name)

  assert.deepEqual(names('G'), ['G', 'B', 'C', 'Cm'])
  // The four reference frames of S6, which are this progression in E.
  assert.deepEqual(names('E'), ['E', 'G#', 'A', 'Am'])
})

test('every song is playable by the instrument that has to play it', () => {
  for (const song of SONGS) {
    const key = keyOf(song)
    assert.ok(song.bars.length > 0, `${song.id} has no bars`)
    for (const bar of song.bars) {
      assert.ok(bar.degree >= 1 && bar.degree <= 7, `${song.id} asks for degree ${bar.degree}`)
      // The pose exists, reads back as the degree it was made for, and builds.
      assert.equal(degreeFromFingers(fingersForDegree(bar.degree)), bar.degree)
      assert.ok(chordOf(key, bar).freqs.length === 4)
    }
  }
})

test('a key the instrument does not have is refused rather than approximated', () => {
  assert.throws(() => keyOf({ ...SONGS[0], key: 'H' }), /cannot play/)
})

test('the chord a bar names is the chord the instrument would build', () => {
  const key = keyOf(songById('creep')!)
  const bar = { degree: 4, major: false }
  assert.deepEqual(
    chordOf(key, bar).freqs,
    buildChord(key, { degree: 4, major: false, voicing: 1, octaveDown: false })!.freqs,
  )
})
