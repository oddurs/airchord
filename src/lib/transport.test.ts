import test from 'node:test'
import assert from 'node:assert/strict'
import { Timeline, Transport } from './transport.ts'

const timeline = (tempo = [{ bar: 0, bpm: 92 }]) =>
  new Timeline({ beatsPerBar: 4, bars: 4, countInBars: 1, tempo })

test('beats land on the grid, and the count-in comes before bar zero', () => {
  const t = timeline()
  t.start(10)
  const spb = 60 / 92

  assert.equal(t.timeOf(0), 10)
  assert.ok(Math.abs(t.timeOf(4) - (10 + 4 * spb)) < 1e-9)

  assert.deepEqual(t.at(0), { index: 0, bar: -1, beat: 0, countIn: true })
  assert.deepEqual(t.at(4), { index: 4, bar: 0, beat: 0, countIn: false })
  assert.deepEqual(t.at(9), { index: 9, bar: 1, beat: 1, countIn: false })
})

test('songs end: past the last bar there is no beat', () => {
  const t = timeline()
  assert.equal(t.totalBeats, 4 + 16)
  assert.deepEqual(t.at(19), { index: 19, bar: 3, beat: 3, countIn: false })
  assert.equal(t.at(20), null)
})

test('a tempo change moves everything after it and nothing before it', () => {
  const t = timeline([
    { bar: 0, bpm: 60 },
    { bar: 2, bpm: 120 },
  ])
  t.start(0)

  // One bar of count-in plus two bars at 60 bpm: twelve beats of one second.
  assert.ok(Math.abs(t.timeOf(4) - 4) < 1e-9)
  assert.ok(Math.abs(t.timeOf(12) - 12) < 1e-9)
  // Then half-second beats.
  assert.ok(Math.abs(t.timeOf(13) - 12.5) < 1e-9)
  assert.equal(t.secondsPerBeatAt(11), 1)
  assert.equal(t.secondsPerBeatAt(12), 0.5)
  // And the inverse agrees with the forward map on both sides of the change.
  for (const beat of [3, 11.5, 12, 15.25]) {
    assert.ok(Math.abs(t.beatAt(t.timeOf(beat)) - beat) < 1e-9, `beat ${beat}`)
  }
})

test('a tempo scale bends the grid from now, it does not slide the past', () => {
  const t = timeline()
  t.start(0)
  const atBeatTwo = t.timeOf(2)
  t.setTempoScale(0.5, atBeatTwo)

  assert.ok(Math.abs(t.timeOf(2) - atBeatTwo) < 1e-9, 'the current beat does not move')
  assert.ok(Math.abs(t.secondsPerBeatAt(2) - 60 / 46) < 1e-9, 'half tempo is twice the beat')
  assert.ok(Math.abs(t.timeOf(3) - (atBeatTwo + 60 / 46)) < 1e-9)
})

test('the transport schedules every beat once, then ends the song once', () => {
  let now = 0
  const seen: number[] = []
  let ended = 0
  const t = timeline()
  const transport = new Transport(t, {
    clock: () => now,
    onBeat: (beat, time) => {
      seen.push(beat.index)
      assert.ok(time >= now, 'a beat is always scheduled in the future')
    },
    onEnd: () => ended++,
    lookaheadSec: 0.12,
  })

  transport.start()
  for (let i = 0; i < 800; i++) {
    now += 0.025
    transport.tick()
  }
  transport.stop()

  assert.deepEqual(seen, Array.from({ length: t.totalBeats }, (_, i) => i))
  assert.equal(ended, 1)
})
