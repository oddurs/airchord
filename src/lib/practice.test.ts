import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { PracticeSession, gradeBar, type Commit, type PracticeState, type Target } from './practice.ts'
import { keyOf, songById } from './songs.ts'
import { fingersForDegree, fingersForVoicing } from './pose.ts'

const creep = songById('creep')!
const key = keyOf(creep)
const BEAT = (60 / creep.bpm) * 1000

const target = (degree: number, major: boolean): Target => ({
  bar: 0,
  degree,
  major,
  fingers: fingersForDegree(degree),
  right: fingersForVoicing(1, false),
  name: 'C',
  numeral: 'IV',
})

const commits = (...pairs: [number, number, boolean][]): Commit[] =>
  pairs.map(([at, degree, major]) => ({ at, degree, major }))

test('a chord reached early and held is the ideal, not a fault', () => {
  const result = gradeBar(target(4, true), commits([-900, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'clean')
  assert.equal(result.offsetMs, 0)
})

test('a chord that arrives inside the beat is clean, and says how late', () => {
  const early = gradeBar(target(4, true), commits([950, 4, true]), 1000, BEAT)
  assert.equal(early.grade, 'clean')

  const result = gradeBar(target(4, true), commits([1100, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'clean')
  assert.equal(result.offsetMs, 100)
})

test('past the beat it is late, and the lateness is reported', () => {
  const result = gradeBar(target(4, true), commits([-500, 1, true], [1300, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'late')
  assert.equal(result.offsetMs, 300)
})

test('the right degree with the wrong wrist is its own answer', () => {
  const result = gradeBar(target(4, false), commits([980, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'quality')
})

test('a different chord is wrong, and no chord at all is missed', () => {
  assert.equal(gradeBar(target(4, true), commits([990, 2, true]), 1000, BEAT).grade, 'wrong')
  assert.equal(gradeBar(target(4, true), commits([-4000, 4, true], [-3000, 1, true]), 1000, BEAT).grade, 'missed')
})

test('learn mode waits for you, and advances only on the chord it asked for', () => {
  const states: PracticeState[] = []
  const session = new PracticeSession({
    song: creep,
    key,
    mode: 'learn',
    audio: null,
    onChange: (s) => states.push(s),
    clock: () => 0,
    nowMs: () => 0,
  })

  session.start()
  assert.equal(session.target!.name, 'G')

  session.commit(2, true, 0)
  assert.equal(session.target!.name, 'G', 'a wrong chord does not move the song on')

  session.commit(1, true, 0)
  assert.equal(session.target!.name, 'B')
  session.commit(3, false, 0)
  assert.equal(session.target!.name, 'B', 'the wrist has to be right too')
  session.commit(3, true, 0)
  assert.equal(session.target!.name, 'C')

  assert.ok(states.length > 0)
  session.dispose()
})

test('a loop played on the beat grades four of four', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  try {
    let audioTime = 0
    const states: PracticeState[] = []
    const session = new PracticeSession({
      song: creep,
      key,
      mode: 'play',
      audio: null,
      onChange: (s) => states.push(s),
      clock: () => audioTime,
      nowMs: () => audioTime * 1000,
    })

    // Play the progression by hand, a quarter beat before each downbeat.
    const spb = 60 / creep.bpm
    const firstDownbeat = 0.1 + creep.countInBars * creep.beatsPerBar * spb
    const played = creep.bars.map((bar, i) => ({
      at: (firstDownbeat + i * creep.beatsPerBar * spb - spb * 0.25) * 1000,
      bar,
    }))

    session.start()
    // Long enough for the count-in, a full loop, and the beat that grades its last bar.
    for (let step = 0; step < 3000; step++) {
      audioTime += 0.005
      const nowMs = audioTime * 1000
      for (const note of played) {
        if (!('done' in note) && nowMs >= note.at) {
          Object.assign(note, { done: true })
          session.commit(note.bar.degree, note.bar.major, note.at)
        }
      }
      mock.timers.tick(5)
    }

    const summary = states.map((s) => s.summary).filter(Boolean).pop()
    assert.ok(summary, 'a loop produces a summary')
    assert.equal(summary!.bars, 4)
    assert.equal(summary!.hits, 4)
    assert.equal(summary!.worst, null)

    session.dispose()
  } finally {
    mock.timers.reset()
  }
})
