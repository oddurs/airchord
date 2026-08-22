import test from 'node:test'
import assert from 'node:assert/strict'
import { COUNT_IN, PATTERNS, hitsOn } from './drums.ts'

test('the rock beat is a rock beat', () => {
  const on = (beat: number) => hitsOn(PATTERNS.rock, beat).map(({ hit }) => hit.voice)
  assert.deepEqual(on(0), ['kick', 'hat', 'hat'])
  assert.deepEqual(on(1), ['snare', 'hat', 'hat'])
  assert.deepEqual(on(2), ['kick', 'hat', 'hat'])
  assert.deepEqual(on(3), ['snare', 'hat', 'hat'])
})

test('hats land on the eighths, offbeats quieter than downbeats', () => {
  const hats = hitsOn(PATTERNS.rock, 1).filter(({ hit }) => hit.voice === 'hat')
  assert.deepEqual(hats.map(({ offset }) => offset), [0, 0.5])
  assert.ok(hats[1].hit.gain < hats[0].hit.gain)
})

test('the count-in is countable: one hit a beat, accented on the one', () => {
  assert.equal(COUNT_IN.length, 4)
  assert.ok(COUNT_IN[0].gain > COUNT_IN[1].gain)
  for (let beat = 0; beat < 4; beat++) {
    assert.equal(hitsOn(COUNT_IN, beat).length, 1)
  }
})

test('no kit is silence, not a default', () => {
  assert.deepEqual(PATTERNS.none, [])
  assert.deepEqual(hitsOn(PATTERNS.none, 0), [])
})

test('every hit falls inside its bar', () => {
  for (const pattern of Object.values(PATTERNS)) {
    for (const hit of pattern) {
      assert.ok(hit.beat >= 0 && hit.beat < 4, `hit at beat ${hit.beat}`)
      assert.ok(hit.gain > 0 && hit.gain <= 1)
    }
  }
})
