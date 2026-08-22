import test from 'node:test'
import assert from 'node:assert/strict'
import { COUNT_IN, GROOVES, eventsOn, swung } from './groove.ts'

test('the full groove is a rock beat', () => {
  const on = (beat: number) => eventsOn(GROOVES.full.drums, beat).map(({ event }) => event.voice)
  assert.deepEqual(on(0), ['kick', 'hat', 'hat'])
  assert.deepEqual(on(1), ['snare', 'hat', 'hat'])
  assert.deepEqual(on(2), ['kick', 'hat', 'hat'])
  assert.deepEqual(on(3), ['snare', 'hat', 'hat'])
})

test('intensity is arrangement, not volume', () => {
  // Silence means no drums, not no instrument: an intro still strums.
  assert.deepEqual(GROOVES.silent.drums, [])
  assert.ok(GROOVES.silent.strum.length > 0)
  // And every step up is busier than the one below it.
  const density = (name: keyof typeof GROOVES) => GROOVES[name].drums.length
  assert.ok(density('silent') < density('sparse'))
  assert.ok(density('sparse') < density('full'))
  assert.ok(density('full') < density('lift'))
})

test('a fill is the same bar, ending differently', () => {
  const { drums, fill } = GROOVES.full
  const late = (hits: typeof drums) => hits.filter((h) => h.beat >= 3).length
  assert.ok(late(fill) > late(drums), 'the fill crowds the last beat')
  assert.deepEqual(
    fill.filter((h) => h.beat === 0).map((h) => h.voice),
    drums.filter((h) => h.beat === 0).map((h) => h.voice),
    'and starts the same way, so it does not arrive out of nowhere',
  )
})

test('swing moves the offbeats and leaves the beats alone', () => {
  assert.equal(swung(0, 0.6), 0)
  assert.equal(swung(2, 0.6), 2)
  assert.equal(swung(0.5, 0), 0.5)
  assert.ok(Math.abs(swung(0.5, 1) - (0.5 + 1 / 6)) < 1e-9, 'full swing is a triplet')
  assert.ok(swung(1.5, 0.5) > 1.5 && swung(1.5, 0.5) < 1.5 + 1 / 6)
})

test('events are bucketed into the beat they fall in, swing included', () => {
  const events = [{ beat: 0 }, { beat: 0.5 }, { beat: 1 }]
  assert.deepEqual(eventsOn(events, 0).map((e) => e.offset), [0, 0.5])
  assert.deepEqual(eventsOn(events, 1).map((e) => e.offset), [0])

  const swungOffsets = eventsOn(events, 0, 1).map((e) => Number(e.offset.toFixed(4)))
  assert.deepEqual(swungOffsets, [0, 0.6667])
})

test('the count-in is countable: one hit a beat, accented on the one', () => {
  assert.equal(COUNT_IN.length, 4)
  assert.ok(COUNT_IN[0].gain > COUNT_IN[1].gain)
  for (let beat = 0; beat < 4; beat++) assert.equal(eventsOn(COUNT_IN, beat).length, 1)
})

test('every hit falls inside its bar, at a sane level', () => {
  const all = Object.values(GROOVES).flatMap((g) => [...g.drums, ...g.fill])
  for (const hit of [...all, ...COUNT_IN]) {
    assert.ok(hit.beat >= 0 && hit.beat < 4, `hit at beat ${hit.beat}`)
    assert.ok(hit.gain > 0 && hit.gain <= 1)
  }
})
