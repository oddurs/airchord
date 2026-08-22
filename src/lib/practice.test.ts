import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { KEYS } from './chords.ts'
import { PracticeSession, gradeChange, type Commit, type PracticeState, type Target } from './practice.ts'
import { bar, type Song } from './songs.ts'
import { fingersForDegree, fingersForVoicing } from './pose.ts'

const I = { degree: 1, major: true }
const IV = { degree: 4, major: true }
const V = { degree: 5, major: true }
const vi = { degree: 6, major: false }

/** Two sections, four bars, and one bar that changes chord halfway through. */
const VERSE = [bar(I), bar(V)]
const CHORUS = [bar(vi), bar(IV, [2, V])]

const SONG: Song = {
  id: 'fixture',
  title: 'Fixture',
  artist: 'Tests',
  key: 'C',
  bpm: 120,
  beatsPerBar: 4,
  countInBars: 1,
  swing: 0,
  sections: [
    { name: 'Verse', bars: VERSE, intensity: 'sparse' },
    { name: 'Chorus', bars: CHORUS, intensity: 'full' },
  ],
  link: '',
  teaches: '',
}

const KEY = KEYS.find((k) => k.name === 'C')!
const BEAT = 500

const target = (degree: number, major: boolean): Target => ({
  bar: 0,
  beat: 0,
  section: 'Verse',
  degree,
  major,
  fingers: fingersForDegree(degree),
  right: fingersForVoicing(1),
  name: 'C',
  numeral: 'I',
})

const commits = (...pairs: [number, number, boolean][]): Commit[] =>
  pairs.map(([at, degree, major]) => ({ at, degree, major }))

test('a chord reached early and held is the ideal, not a fault', () => {
  const result = gradeChange(target(4, true), commits([-900, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'clean')
  assert.equal(result.offsetMs, 0)
})

test('a chord that arrives inside the beat is clean, and says how late', () => {
  assert.equal(gradeChange(target(4, true), commits([950, 4, true]), 1000, BEAT).grade, 'clean')
  const result = gradeChange(target(4, true), commits([1100, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'clean')
  assert.equal(result.offsetMs, 100)
})

test('past the beat it is late, and the lateness is reported', () => {
  const result = gradeChange(target(4, true), commits([-500, 1, true], [1300, 4, true]), 1000, BEAT)
  assert.equal(result.grade, 'late')
  assert.equal(result.offsetMs, 300)
})

test('the right degree with the wrong wrist is its own answer', () => {
  assert.equal(gradeChange(target(4, false), commits([980, 4, true]), 1000, BEAT).grade, 'quality')
})

test('a different chord is wrong, and no chord at all is missed', () => {
  assert.equal(gradeChange(target(4, true), commits([990, 2, true]), 1000, BEAT).grade, 'wrong')
  assert.equal(gradeChange(target(4, true), commits([-4000, 4, true], [-3000, 1, true]), 1000, BEAT).grade, 'missed')
})

test('learn mode waits for you, through changes inside a bar as well as bars', () => {
  const session = new PracticeSession({
    song: SONG,
    key: KEY,
    mode: 'learn',
    audio: null,
    onChange: () => {},
    clock: () => 0,
    nowMs: () => 0,
  })

  const reach = (degree: number, major: boolean) => session.commit(degree, major, 0)
  const at = () => `${session.target!.name} @${session.target!.bar}.${session.target!.beat}`

  session.start()
  assert.equal(at(), 'C @0.0')
  reach(2, true)
  assert.equal(at(), 'C @0.0', 'a wrong chord does not move the song on')
  reach(1, true)
  assert.equal(at(), 'G @1.0')
  reach(5, true)
  assert.equal(at(), 'Am @2.0')
  reach(6, false)
  assert.equal(at(), 'F @3.0')
  reach(4, true)
  assert.equal(at(), 'G @3.2', 'the second change of the bar, on beat two')
  reach(5, true)
  assert.equal(at(), 'C @0.0', 'and round again')

  session.dispose()
})

test('a song played on the beat runs to its end and grades every section', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  try {
    let audioTime = 0
    const states: PracticeState[] = []
    const session = new PracticeSession({
      song: SONG,
      key: KEY,
      mode: 'play',
      audio: null,
      onChange: (s) => states.push(s),
      clock: () => audioTime,
      nowMs: () => audioTime * 1000,
    })

    // Every change, played a quarter of a beat before it is due.
    const spb = 60 / SONG.bpm
    const first = 0.1 + SONG.countInBars * SONG.beatsPerBar * spb
    const played = [
      { at: first, chord: I },
      { at: first + 4 * spb, chord: V },
      { at: first + 8 * spb, chord: vi },
      { at: first + 12 * spb, chord: IV },
      { at: first + 14 * spb, chord: V },
    ].map((c) => ({ ...c, at: (c.at - spb * 0.25) * 1000, done: false }))

    session.start()
    for (let step = 0; step < 3000; step++) {
      audioTime += 0.005
      for (const note of played) {
        if (!note.done && audioTime * 1000 >= note.at) {
          note.done = true
          session.commit(note.chord.degree, note.chord.major, note.at)
        }
      }
      mock.timers.tick(5)
    }

    const last = states.at(-1)!
    assert.ok(last.done, 'the song ends')
    assert.equal(last.running, false)

    const grades = states.map((s) => s.result?.grade).filter(Boolean)
    assert.ok(grades.length >= 5)
    assert.ok(grades.every((g) => g === 'clean'), `every change clean, got ${[...new Set(grades)].join()}`)

    const summaries = states.map((s) => s.summary).filter(Boolean)
    const verse = summaries.find((s) => s!.section === 'Verse')!
    const chorus = summaries.find((s) => s!.section === 'Chorus')!
    assert.deepEqual([verse.hits, verse.changes], [2, 2])
    assert.deepEqual([chorus.hits, chorus.changes], [3, 3], 'the split bar counts as two changes')

    // The sections are announced while they are being played, not afterwards.
    assert.ok(states.some((s) => s.section === 'Verse' && s.nextSection === 'Chorus'))
    assert.ok(states.some((s) => s.countIn))

    session.dispose()
  } finally {
    mock.timers.reset()
  }
})
