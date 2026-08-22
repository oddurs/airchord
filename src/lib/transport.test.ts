import test from 'node:test'
import assert from 'node:assert/strict'
import { Timeline, Transport } from './transport.ts'

const timeline = () => new Timeline({ bpm: 92, beatsPerBar: 4, bars: 4, countInBars: 1 })

test('beats land on the grid, and the count-in comes before bar zero', () => {
  const t = timeline()
  t.start(10)
  const spb = 60 / 92

  assert.equal(t.timeOf(0), 10)
  assert.ok(Math.abs(t.timeOf(4) - (10 + 4 * spb)) < 1e-9)

  assert.deepEqual(t.at(0), { index: 0, bar: -1, beat: 0, loop: 0, countIn: true })
  assert.deepEqual(t.at(4), { index: 4, bar: 0, beat: 0, loop: 0, countIn: false })
  assert.deepEqual(t.at(9), { index: 9, bar: 1, beat: 1, loop: 0, countIn: false })
})

test('the song loops without a seam', () => {
  const t = timeline()
  // One beat past the last beat of the last bar is bar zero of the next loop.
  assert.deepEqual(t.at(4 + 15), { index: 19, bar: 3, beat: 3, loop: 0, countIn: false })
  assert.deepEqual(t.at(4 + 16), { index: 20, bar: 0, beat: 0, loop: 1, countIn: false })
})

test('a tempo change bends the grid from now, it does not slide the past', () => {
  const t = timeline()
  t.start(0)
  const atBeatTwo = t.timeOf(2)
  t.setTempoScale(0.5, atBeatTwo)

  assert.ok(Math.abs(t.timeOf(2) - atBeatTwo) < 1e-9, 'the current beat does not move')
  assert.ok(Math.abs(t.secondsPerBeat - (60 / 46)) < 1e-9, 'half tempo is twice the beat')
  assert.ok(Math.abs(t.timeOf(3) - (atBeatTwo + 60 / 46)) < 1e-9)
})

test('the transport schedules ahead, and never schedules a beat twice', () => {
  let now = 0
  const seen: number[] = []
  const t = timeline()
  const transport = new Transport(t, {
    clock: () => now,
    onBeat: (beat, time) => {
      seen.push(beat.index)
      assert.ok(time >= now, 'a beat is always scheduled in the future')
    },
    lookaheadSec: 0.12,
  })

  transport.start()
  for (let i = 0; i < 200; i++) {
    now += 0.025
    transport.tick()
  }
  transport.stop()

  const spb = 60 / 92
  const expected = Math.floor((now + 0.12 - 0.1) / spb) + 1
  assert.deepEqual(seen, Array.from({ length: seen.length }, (_, i) => i))
  assert.equal(seen.length, expected)
})
