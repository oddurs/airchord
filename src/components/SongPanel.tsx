'use client'

import type { Mode, PracticeState, Result, Summary } from '@/lib/practice'
import type { Song } from '@/lib/songs'
import HandDiagram from './HandDiagram'
import styles from './SongPanel.module.css'

interface Props {
  songs: Song[]
  song: Song | null
  mode: Mode
  tempoScale: number
  state: PracticeState | null
  transport: 'stopped' | 'playing' | 'paused'
  onChoose: (id: string | null) => void
  onMode: (mode: Mode) => void
  onTempo: (scale: number) => void
  onToggle: () => void
  onStop: () => void
}

const TEMPOS = [0.5, 0.6, 0.7, 0.8, 0.9, 1]

/** Said plainly, because four ways to miss are four different things to fix.
 *  Phrased to read both on its own and after a "the" in the loop summary. */
function say(result: Result): string {
  switch (result.grade) {
    case 'clean':
      return 'was on the beat'
    case 'late':
      return `was late by ${result.offsetMs} ms`
    case 'quality':
      return 'had the wrong lean'
    case 'wrong':
      return 'was another chord'
    case 'missed':
      return 'was missed'
  }
}

function summarise(summary: Summary): string {
  const score = `${summary.section} · ${summary.hits} of ${summary.changes}`
  if (!summary.worst) return score
  return `${score} — the ${summary.worst.name} ${say(summary.worst)}`
}

export default function SongPanel({
  songs,
  song,
  mode,
  tempoScale,
  state,
  transport,
  onChoose,
  onMode,
  onTempo,
  onToggle,
  onStop,
}: Props) {
  return (
    <aside className={styles.panel}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={`${styles.name} label`}>Song</span>
          <select
            className={styles.select}
            value={song?.id ?? ''}
            onChange={(e) => onChoose(e.target.value || null)}
          >
            <option value="">None</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.artist}
              </option>
            ))}
          </select>
        </label>

        {song && (
          <div className={styles.transport} role="group" aria-label="Transport">
            <button type="button" className={`${styles.play} label`} onClick={onToggle}>
              {transport === 'playing' ? 'Pause' : transport === 'paused' ? 'Resume' : 'Play'}
            </button>
            <button
              type="button"
              className={`${styles.mode} label`}
              onClick={onStop}
              disabled={transport === 'stopped'}
            >
              Stop
            </button>
          </div>
        )}

        {song && (
          <div className={styles.modes} role="group" aria-label="Practice mode">
            <button
              type="button"
              className={`${styles.mode} label`}
              aria-pressed={mode === 'learn'}
              onClick={() => onMode('learn')}
              title="No clock. The song waits for you."
            >
              Learn
            </button>
            <button
              type="button"
              className={`${styles.mode} label`}
              aria-pressed={mode === 'play'}
              onClick={() => onMode('play')}
              title="In time, with a drum track."
            >
              In time
            </button>
          </div>
        )}

        {song && mode === 'play' && (
          <label className={styles.field}>
            <span className={`${styles.name} label`}>Tempo</span>
            <select
              className={styles.select}
              value={tempoScale}
              onChange={(e) => onTempo(Number(e.target.value))}
            >
              {TEMPOS.map((scale) => (
                <option key={scale} value={scale}>
                  {Math.round(song.bpm * scale)} bpm
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {song && state && (
        <>
          {/* Where you are in the arrangement. A song has sections, and knowing
              the chorus is two bars away is most of playing one. */}
          {state.section && (
            <p className={`${styles.where} label`}>
              <span className={styles.section}>{state.section}</span>
              {state.nextSection && state.barsToNextSection !== null && (
                <span className={styles.ahead}>
                  {state.nextSection} in {state.barsToNextSection}
                </span>
              )}
            </p>
          )}

          <ol className={styles.lane}>
            {state.lane.map((target, i) => (
              <li key={`${target.bar}-${i}`} className={i === 0 ? styles.now : styles.next}>
                <span className={styles.chord}>
                  <span className={styles.chordName}>{target.name}</span>
                  <span className={styles.numeral}>{target.numeral}</span>
                </span>
                {/* No dial in the lane: four of them in a row is noise, and
                    the chord's own name already says major or minor. */}
                <HandDiagram fingers={target.fingers} side="left" size={24} />
              </li>
            ))}
          </ol>

          {mode === 'play' && (
            <div className={styles.beats} aria-hidden="true">
              {Array.from({ length: song.beatsPerBar }, (_, i) => (
                <span
                  // Re-keyed every beat so the pulse restarts rather than resumes.
                  key={i === Math.floor(state.beat) ? `${state.bar}-${i}` : i}
                  className={i === Math.floor(state.beat) ? styles.beatOn : styles.beat}
                  style={
                    i === Math.floor(state.beat) ? { animationDuration: `${Math.round(state.beatMs)}ms` } : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* Both hands for the bar you are in. It sits below the lane rather
              than inside it, so the picture you are copying does not slide
              sideways every bar. */}
          <div className={styles.hands}>
            <figure className={styles.hand}>
              <HandDiagram
                fingers={state.lane[0].fingers}
                side="left"
                lean={state.lane[0].major ? 'major' : 'minor'}
                size={46}
              />
              <figcaption className={`${styles.handName} label`}>Chord</figcaption>
            </figure>
            <figure className={styles.hand}>
              <HandDiagram fingers={state.lane[0].right} side="right" size={46} />
              <figcaption className={`${styles.handName} label`}>Sound</figcaption>
            </figure>
          </div>

          <p className={styles.feedback} aria-live="polite">
            {state.done ? (
              <>
                <span className={styles.resultName}>Finished</span>
                <span className={styles.resultSaid}>
                  {state.total.hits} of {state.total.changes} changes on the beat
                </span>
              </>
            ) : state.countIn ? (
              <span className="label">Count in</span>
            ) : state.result ? (
              <>
                <span className={styles.resultName}>{state.result.name}</span>
                <span className={styles.resultSaid}>{say(state.result)}</span>
              </>
            ) : (
              <span className={styles.quiet}>{mode === 'learn' ? song.teaches : ' '}</span>
            )}
          </p>

          {state.summary && mode === 'play' && !state.done && (
            <p className={`${styles.summary} label`}>{summarise(state.summary)}</p>
          )}
        </>
      )}
    </aside>
  )
}
