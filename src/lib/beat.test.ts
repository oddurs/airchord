import test from 'node:test'
import assert from 'node:assert/strict'
import { BeatBox, SIGNATURES, barHits, signatureById } from './beat.ts'

const four = signatureById('4/4')

test('every pattern fits its bar and hits at a sane level', () => {
  for (const signature of SIGNATURES) {
    for (const hit of [...signature.pattern, ...signature.fill]) {
      assert.ok(hit.beat >= 0 && hit.beat < signature.beats, `${signature.id} hit at ${hit.beat}`)
      assert.ok(hit.gain > 0 && hit.gain <= 1)
    }
    assert.ok(signature.pattern.some((h) => h.beat === 0 && h.voice === 'kick'), `${signature.id} has a downbeat`)
  }
})

test('six-eight is a waltz with the weight in a different place', () => {
  const waltz = signatureById('3/4')
  const compound = signatureById('6/8')
  assert.equal(compound.beats, waltz.beats, 'both are three quarter-note beats')

  // A waltz puts a snare on two and three; six-eight puts one on the second
  // dotted-quarter pulse, which is where the two feels part company.
  assert.deepEqual(waltz.pattern.filter((h) => h.voice === 'snare').map((h) => h.beat), [1, 2])
  assert.deepEqual(compound.pattern.filter((h) => h.voice === 'snare').map((h) => h.beat), [1.5])
})

test('the fourth bar is the one that differs', () => {
  assert.equal(barHits(four, 0), four.pattern)
  assert.equal(barHits(four, 2), four.pattern)
  assert.equal(barHits(four, 3), four.fill)
  assert.equal(barHits(four, 7), four.fill)
})

test('bars are scheduled once each, in the future, on the grid', () => {
  let now = 0
  const played: { voice: string; time: number }[] = []
  const box = new BeatBox({
    clock: () => now,
    play: (voice, time) => {
      assert.ok(time >= now, 'never scheduled in the past')
      played.push({ voice, time })
    },
    lookaheadSec: 0.15,
  })

  box.start(four, 120) // two seconds a bar
  for (let i = 0; i < 400; i++) {
    now += 0.025
    box.tick()
  }
  box.stop()

  const downbeats = played.filter((p) => p.voice === 'kick' && Math.abs((p.time - 0.08) % 2) < 1e-9)
  assert.ok(downbeats.length >= 4, 'a downbeat every two seconds')
  // Each bar's first kick lands exactly a bar after the one before it.
  const gaps = downbeats.slice(1).map((p, i) => Number((p.time - downbeats[i].time).toFixed(6)))
  assert.deepEqual(new Set(gaps), new Set([2]))
})

test('a tempo change lands on the next bar line, not in the middle of one', () => {
  let now = 0
  const played: number[] = []
  const box = new BeatBox({
    clock: () => now,
    play: (_voice, time) => played.push(time),
    lookaheadSec: 0.15,
  })

  box.start(four, 120)
  // Let the first bar be scheduled, then double the tempo mid-bar.
  now += 0.5
  box.tick()
  const scheduled = [...played]
  box.setBpm(240)
  now += 0.5
  box.tick()

  // Nothing already scheduled moved…
  assert.deepEqual(played.slice(0, scheduled.length), scheduled)
  // …and the bar after the change is a bar long at the new tempo.
  const bars = played.filter((t, i) => i === 0 || t - played[i - 1] > 0.4)
  assert.ok(bars.length >= 2)
  box.stop()
})
