import test from 'node:test'
import assert from 'node:assert/strict'
import { degreeFromFingers, voicingFromFingers } from './chords.ts'
import { DIAL, dialArc, fingersForDegree, fingersForVoicing, frameFacing, frameOf, handTemplate, place, type Frame } from './pose.ts'

test('every degree has a pose, and the pose reads back as that degree', () => {
  for (let degree = 1; degree <= 7; degree++) {
    assert.equal(degreeFromFingers(fingersForDegree(degree)), degree, `degree ${degree}`)
  }
})

test('a template is 21 landmarks with the wrist at the origin', () => {
  const points = handTemplate(fingersForDegree(1))
  assert.equal(points.length, 21)
  assert.deepEqual(points[0], { x: 0, y: 0 })
  // The middle knuckle defines the palm frame, so it sits at exactly one unit.
  assert.deepEqual(points[9], { x: 0, y: 1 })
})

test('a raised finger reaches past the knuckles; a curled one folds over the palm', () => {
  const raised = handTemplate([false, true, false, false, false])
  const curled = handTemplate([false, false, false, false, false])

  assert.ok(raised[8].y > raised[5].y + 0.5, 'the raised index reaches well past its knuckle')
  assert.ok(curled[8].y < curled[5].y, 'the curled index tip sits below its knuckle')
  assert.ok(Math.abs(curled[8].x) < Math.abs(curled[5].x) + 0.2, 'and stays over the palm')
})

test('a pose placed in a hand frame comes back with that frame', () => {
  const frames: Frame[] = [
    { origin: { x: 0.5, y: 0.5 }, up: { x: 0, y: -1 }, across: { x: 1, y: 0 }, scale: 0.2 },
    // A rotated hand, and one whose thumb is on the other side.
    { origin: { x: 0.2, y: 0.8 }, up: { x: 0.6, y: -0.8 }, across: { x: -0.8, y: -0.6 }, scale: 0.31 },
  ]

  for (const frame of frames) {
    const placed = place(handTemplate(fingersForDegree(4)), frame)
    const read = frameOf(placed)
    assert.ok(Math.abs(read.scale - frame.scale) < 1e-9)
    assert.ok(Math.abs(read.up.x - frame.up.x) < 1e-9 && Math.abs(read.up.y - frame.up.y) < 1e-9)
    assert.ok(Math.abs(read.across.x - frame.across.x) < 1e-9 && Math.abs(read.across.y - frame.across.y) < 1e-9)
    assert.deepEqual(read.origin, frame.origin)
  }
})

test('the frame is read from the hand, so handedness never appears in the maths', () => {
  const right = place(handTemplate(fingersForDegree(3)), {
    origin: { x: 0.5, y: 0.5 },
    up: { x: 0, y: -1 },
    across: { x: 1, y: 0 },
    scale: 0.2,
  })
  // The same hand mirrored: the frame's across flips with it, and nothing else.
  const left = right.map((p) => ({ x: 1 - p.x, y: p.y }))
  assert.equal(frameOf(left).across.x, -frameOf(right).across.x)
  assert.equal(frameOf(left).up.y, frameOf(right).up.y)
})

test('every voicing has a pose, thumb included', () => {
  for (let voicing = 1; voicing <= 4; voicing++) {
    assert.equal(voicingFromFingers(fingersForVoicing(voicing, false)), voicing)
    assert.equal(fingersForVoicing(voicing, true)[0], true)
  }
})

test('a diagram hand faces the way the camera shows it back to you', () => {
  const left = frameFacing('left', 0, 10, { x: 0, y: 0 })
  const right = frameFacing('right', 0, 10, { x: 0, y: 0 })

  // Both point up the screen; the thumb side is the only thing that flips.
  assert.deepEqual(left.up, right.up)
  assert.equal(left.across.x, 1)
  assert.equal(right.across.x, -1)
  // And the frame stays a frame: axes perpendicular, whatever the tilt.
  for (const frame of [left, right, frameFacing('left', 13, 10, { x: 0, y: 0 })]) {
    assert.ok(Math.abs(frame.up.x * frame.across.x + frame.up.y * frame.across.y) < 1e-9)
  }
})

test('tilt leans the hand the way the wrist has to go', () => {
  const tip = (tilt: number) =>
    place(handTemplate(fingersForDegree(1)), frameFacing('left', tilt, 100, { x: 0, y: 0 }))[8].x

  assert.ok(tip(13) > tip(0), 'major leans right on screen')
  assert.ok(tip(-13) < tip(0), 'minor leans left')
})

test('the dial sweeps below the wrist, major to the right and minor to the left', () => {
  const radius = 20
  const major = dialArc(DIAL.gear * 0.045, DIAL.span, radius)
  const minor = dialArc(-DIAL.span, DIAL.gear * -0.07, radius)

  assert.ok(major.every((p) => p.x > 0 && p.y > 0), 'major sits right of and below the wrist')
  assert.ok(minor.every((p) => p.x < 0 && p.y > 0), 'minor sits left of and below it')
  assert.ok(major.every((p) => Math.abs(Math.hypot(p.x, p.y) - radius) < 1e-9), 'and it is a circle')
})
