import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CaptureSession, POSES } from './capture.ts'
import type { HandState, Side } from './features.ts'

const FIST = POSES.find((p) => p.id === 'fist')!

/** Only the fields the recorder touches; the rest is irrelevant to a take. */
function hand(side: Side): HandState {
  return { side, raw: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })) } as unknown as HandState
}

/** Feeds frames until the take finishes, the way the render loop does. */
function run(session: CaptureSession, hands: HandState[], frames: number, from = 0) {
  let last = { captured: 0, target: 45, hands: 0, done: false } as ReturnType<CaptureSession['accept']>
  for (let i = 0; i < frames && !last.done; i++) last = session.accept(hands, from + i * 33)
  return last
}

test('a take completes with one hand in view', () => {
  const session = new CaptureSession()
  session.begin(FIST, 0, 'left')
  const result = run(session, [hand('left')], 45)
  assert.equal(result.done, true)
  assert.equal(session.total, 1)
})

test('a hand that appears once does not block the take', () => {
  // The reported failure: requiring every hand seen to fill its buffer meant a
  // single spurious frame from a second hand stalled the take forever, and the
  // panel locked with every count at zero.
  const session = new CaptureSession()
  session.begin(FIST, 0, 'left')
  session.accept([hand('left'), hand('right')], 0)
  const result = run(session, [hand('left')], 45, 33)
  assert.equal(result.done, true, 'the take must still finish')
  assert.equal(session.total, 1, 'the one-frame hand is discarded, not kept')
})

test('only the nominated hand is recorded', () => {
  // Recording both under one label is what produced a third of the first
  // dataset with the wrong pose attached to a resting hand.
  const session = new CaptureSession()
  session.begin(FIST, 0, 'left')
  run(session, [hand('left'), hand('right')], 45)
  assert.equal(session.total, 1)
})

test('a take waits for hands rather than recording an empty room', () => {
  const session = new CaptureSession()
  session.begin(FIST, 0, 'left')
  const waiting = session.accept([], 5000)
  assert.equal(waiting.done, false, 'still waiting, not failed')
  assert.equal(waiting.recording, false)

  // Hands arriving late is normal — you clicked with one of them.
  const started = session.accept([hand('left')], 6000)
  assert.equal(started.recording, true, 'the clock starts when hands appear')
})

test('a take gives up if hands never appear', () => {
  const session = new CaptureSession()
  session.begin(FIST, 0, 'left')
  const result = session.accept([], 25000)
  assert.equal(result.done, true, 'it must end')
  assert.ok(result.failed, 'and say why')
  assert.equal(session.total, 0)
})

test('starting a new take abandons the one in progress', () => {
  const session = new CaptureSession()
  session.begin(FIST, 0, 'left')
  run(session, [hand('left')], 10)
  session.begin(FIST, 1000, 'left')
  run(session, [hand('left')], 45, 1000)
  assert.equal(session.total, 1, 'the abandoned take contributes nothing')
})
