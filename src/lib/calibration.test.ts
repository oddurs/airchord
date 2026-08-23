import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CALIBRATION_VERSION, derive, isValid, reachTo01, type Samples } from './calibration.ts'

const fill = (value: number, n = 30) => Array.from({ length: n }, (_, i) => value + (i % 3) * 0.001)

/** A player who holds upright near zero and leans a clear way past it. */
const good: Samples = {
  upright: fill(0.01),
  leaned: fill(-0.22),
  low: fill(0.12),
  high: fill(0.88),
  thumbIn: fill(0.18),
  thumbOut: fill(0.42),
}

const ok = (r: ReturnType<typeof derive>) => {
  assert.ok('calibration' in r, 'problems' in r ? JSON.stringify(r.problems) : '')
  return (r as { calibration: ReturnType<typeof derive> extends never ? never : any }).calibration
}

test('a clean set of holds derives a calibration', () => {
  const c = ok(derive(good))
  assert.equal(c.version, CALIBRATION_VERSION)
  assert.ok(Math.abs(c.lean.offset - 0.01) < 0.01, 'upright becomes the zero')
  assert.ok(c.lean.on < c.lean.off, 'engaging is further out than releasing')
  assert.ok(c.lean.on > -0.22, 'the threshold sits short of the lean, not at it')
})

test('thresholds scale to how far the player actually leans', () => {
  const small = ok(derive({ ...good, leaned: fill(-0.12) }))
  const large = ok(derive({ ...good, leaned: fill(-0.5) }))
  assert.ok(large.lean.on < small.lean.on, 'a bigger lean earns a wider band')
})

test('the thumb band is biased toward reading the thumb as folded', () => {
  const c = ok(derive(good))
  const midpoint = (0.18 + 0.42) / 2
  assert.ok(c.thumb.on > midpoint, 'engaging needs more than half the gap')
})

test('holds too close together are refused rather than saved', () => {
  // Refusing matters: a calibration derived from two indistinguishable holds is
  // worse than the defaults, because it looks measured.
  const flat = derive({ ...good, leaned: fill(0.0) })
  assert.ok('problems' in flat && flat.problems.some((p) => p.step === 'leaned'))

  const noReach = derive({ ...good, high: fill(0.2) })
  assert.ok('problems' in noReach && noReach.problems.some((p) => p.step === 'high'))

  const noThumb = derive({ ...good, thumbOut: fill(0.2) })
  assert.ok('problems' in noThumb && noThumb.problems.some((p) => p.step === 'thumbOut'))
})

test('a step without enough steady frames is named', () => {
  const short = derive({ ...good, low: [0.1, 0.1] })
  assert.ok('problems' in short && short.problems.some((p) => p.step === 'low'))
})

test('stored calibrations from an older version are rejected', () => {
  const c = ok(derive(good))
  assert.equal(isValid(c), true)
  assert.equal(isValid({ ...c, version: CALIBRATION_VERSION - 1 }), false)
  assert.equal(isValid({ ...c, lean: { ...c.lean, on: NaN } }), false)
  assert.equal(isValid(null), false)
})

test('reach maps the range the player uses onto the full range', () => {
  const reach = { low: 0.2, high: 0.8 }
  assert.equal(reachTo01(0.2, reach), 0)
  assert.equal(reachTo01(0.8, reach), 1)
  assert.ok(Math.abs(reachTo01(0.5, reach) - 0.5) < 1e-9)
  // Beyond their range still reads as the end of it, never past it.
  assert.equal(reachTo01(0.05, reach), 0)
  assert.equal(reachTo01(0.95, reach), 1)
})
