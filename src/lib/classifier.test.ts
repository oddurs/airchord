import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { FingerClassifier } from './classifier.ts'
import { describeLandmarks } from './features.ts'
import { degreeFromFingers, leanToMajor } from './chords.ts'
import type { Dataset, Sample } from './capture.ts'

/**
 * Replays recorded hands through the live classifier. This is the durability
 * mechanism: accuracy has degraded twice without any test noticing, because no
 * test could see it. Thresholds tuned against a handful of frames will keep
 * failing on poses those frames never contained.
 *
 * Capture a dataset with `npm run dev` and `?capture`, then save it here.
 */
const FIXTURE = fileURLToPath(new URL('./fixtures/gestures.json', import.meta.url))

/** Correct classification required on deliberately held poses. */
const ACCURACY_FLOOR = 0.99

function load(): Dataset | null {
  try {
    return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Dataset
  } catch {
    return null
  }
}

/** Replays a take the way the instrument sees it: frame by frame, latches and all. */
function classify(sample: Sample) {
  const classifier = new FingerClassifier()
  let fingers = classifier.update(describeLandmarks(sample.frames[0], sample.side))
  for (const frame of sample.frames) {
    fingers = classifier.update(describeLandmarks(frame, sample.side))
  }
  return fingers
}

const dataset = load()

test('recorded hands classify correctly', { skip: dataset ? false : 'no dataset captured yet' }, () => {
  const failures: string[] = []
  const samples = dataset!.samples.filter((s) => s.trusted !== false)
  for (const sample of samples) {
    const got = classify(sample)
    if (got.join() !== sample.expected.join()) {
      failures.push(`${sample.label} (${sample.side}): expected ${sample.expected.join()}, got ${got.join()}`)
    }
  }
  const accuracy = 1 - failures.length / samples.length
  assert.ok(
    accuracy >= ACCURACY_FLOOR,
    `accuracy ${(accuracy * 100).toFixed(1)}% is below ${ACCURACY_FLOOR * 100}%\n  ${failures.join('\n  ')}`,
  )
})

test('poses that mean nothing produce no chord', { skip: dataset ? false : 'no dataset captured yet' }, () => {
  // The reported bug, as a test: a closed fist kept a chord sounding.
  const silent = dataset!.samples.filter((s) => s.label === 'fist' || s.label === 'relaxed')
  assert.ok(silent.length > 0, 'the dataset must include poses that should make no sound')
  for (const sample of silent) {
    assert.equal(
      degreeFromFingers(classify(sample)),
      null,
      `${sample.label} (${sample.side}) triggered a chord`,
    )
  }
})

test('an upright hand always reads major, whatever it played before', () => {
  // The reported bug: after a minor chord, straightening into a single finger
  // kept playing minor. Every pose in the dataset was held upright, so every one
  // must resolve to major even when the previous answer was minor.
  const upright = dataset!.samples.filter((s) => s.trusted !== false && s.side === 'left')
  assert.ok(upright.length > 0)

  for (const sample of upright) {
    let major = false // worst case: coming out of a minor chord
    for (const frame of sample.frames) {
      major = leanToMajor(describeLandmarks(frame, sample.side).roll, major)
    }
    assert.equal(major, true, `${sample.label} stayed minor while held upright`)
  }
})
