import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Committer, Grace, Latch, Smoothed } from './smoothing.ts'
import { registerFromHeight } from './classifier.ts'

// Extension ratios measured from real footage: curled fingers sit at 0.62-0.80,
// extended ones at 1.26-1.42. The latch band lives in the gap between.
const FINGER = () => new Latch(1.1, 0.95)

test('a latch answers clearly on either side of its band', () => {
  const finger = FINGER()
  assert.equal(finger.update(1.36), true, 'an extended finger reads up')
  assert.equal(finger.update(0.7), false, 'a curled finger reads down')
})

test('a latch holds its answer inside the band', () => {
  const rising = FINGER()
  rising.update(1.36)
  assert.equal(rising.update(1.02), true, 'still up while ambiguous')

  const falling = FINGER()
  falling.update(0.7)
  assert.equal(falling.update(1.02), false, 'still down while ambiguous')
})

test('a measurement sitting on the threshold stops flip-flopping', () => {
  // This is the five-finger jitter, reproduced: a value hovering at the old
  // single threshold used to produce a new answer every frame.
  const finger = FINGER()
  const noisy = [1.28, 1.06, 1.31, 0.99, 1.27, 1.03, 1.3]
  const answers = noisy.map((v) => finger.update(v))
  assert.deepEqual(answers, [true, true, true, true, true, true, true])
})

test('smoothing converges without overshooting', () => {
  const s = new Smoothed(0.5)
  assert.equal(s.update(1), 1, 'first sample is taken as-is, no ramp-in')
  assert.equal(s.update(0), 0.5)
  assert.equal(s.update(0), 0.25)
})

test('smoothing damps a single-frame spike', () => {
  const s = new Smoothed(0.35)
  for (const v of [0.2, 0.2, 0.2]) s.update(v)
  const spiked = s.update(1)
  assert.ok(spiked < 0.5, `a lone outlier must not swing the value: ${spiked}`)
})

test('a committer waits for a gesture to be held before acting on it', () => {
  const c = new Committer<string>(100)
  assert.equal(c.update('E', 'E', 0), null, 'nothing commits instantly')
  assert.equal(c.update('E', 'E', 60), null, 'still too early')
  assert.equal(c.update('E', 'E', 120), 'E', 'held long enough')
})

test('a committer restarts the clock when the gesture changes', () => {
  const c = new Committer<string>(100)
  c.update('E', 'E', 0)
  c.update('E', 'E', 120)
  // Passing through A on the way to G must not commit A.
  assert.equal(c.update('A', 'A', 130), 'E', 'still the old chord')
  assert.equal(c.update('G', 'G', 190), 'E', 'a gesture in transit never lands')
  assert.equal(c.update('G', 'G', 300), 'G')
})

test('separate committers give chord and colour different latencies', () => {
  const chord = new Committer<string>(100)
  const colour = new Committer<string>(40)
  chord.update('E', 'E', 0)
  colour.update('7th', '7th', 0)
  // At 50ms the colour has landed and the chord has not, which is the point.
  assert.equal(colour.update('7th', '7th', 50), '7th')
  assert.equal(chord.update('E', 'E', 50), null)
})

test('grace carries a value through a dropout and then lets go', () => {
  const g = new Grace<number>(200)
  assert.equal(g.update(5, 0), 5)
  assert.equal(g.update(null, 100), 5, 'a dropped frame is not a release')
  assert.equal(g.update(null, 250), null, 'a real absence eventually is')
})

test('grace re-arms on every sighting', () => {
  const g = new Grace<number>(200)
  g.update(5, 0)
  g.update(null, 150)
  g.update(7, 180)
  assert.equal(g.update(null, 350), 7, 'the window runs from the last sighting')
})

test('a committer can be told to trust this frame sooner', () => {
  const committer = new Committer<string>(100)
  committer.update('chord', 'chord', 0)
  assert.equal(committer.update('chord', 'chord', 50), null, 'not yet, on the default hold')
  assert.equal(committer.update('chord', 'chord', 50, 45), 'chord', 'but an expected answer commits')
})

test('holding sustains a commitment without letting anything new land', () => {
  // Grace exists to carry a chord through a dropped tracking frame. It must not
  // also authorise a different chord — a stale hand playing something that was
  // never made is the ghost-input bug.
  const c = new Committer<string>(100)
  c.update('E', 'E', 0)
  c.update('E', 'E', 150)
  assert.equal(c.hold(), 'E', 'still sounding')
  assert.equal(c.hold(), 'E', 'and again — holding does not advance anything')
  assert.equal(c.update('A', 'A', 300), 'E', 'a new candidate still has to earn it')
})

test('releasing drops the chord immediately, without waiting out a hold', () => {
  // Hands gone means silence now, not silence in another 100ms.
  const c = new Committer<string>(100)
  c.update('E', 'E', 0)
  c.update('E', 'E', 150)
  c.release()
  assert.equal(c.hold(), null)
  assert.equal(c.current, null)
})

test('a released committer still needs a full hold before sounding again', () => {
  const c = new Committer<string>(100)
  c.update('E', 'E', 0)
  c.update('E', 'E', 150)
  c.release()
  assert.equal(c.update('E', 'E', 160), null, 'no instant re-entry')
  assert.equal(c.update('E', 'E', 300), 'E')
})

test('register follows the height of the chord hand', () => {
  assert.equal(registerFromHeight(0.1, 0), -1, 'low is an octave down')
  assert.equal(registerFromHeight(0.5, 0), 0, 'mid is as written')
  assert.equal(registerFromHeight(0.9, 0), 1, 'high is an octave up')
})

test('register holds through drift near a boundary', () => {
  // A hand hovering at a boundary must not flicker between octaves — an octave
  // is the largest change the instrument can make.
  assert.equal(registerFromHeight(0.36, -1), -1, 'just over, still low')
  assert.equal(registerFromHeight(0.32, 0), 0, 'just under, still mid')
  assert.equal(registerFromHeight(0.64, 1), 1, 'just under, still high')
  // But a decisive move always wins.
  assert.equal(registerFromHeight(0.8, -1), 1)
  assert.equal(registerFromHeight(0.1, 1), -1)
})
