import { KEYS, buildChord } from './chords'
import { buildKit } from './drums'
import type { Voice } from './groove'
import { buildSynth } from './synth'
import { TIMBRES, type TimbreId } from './timbre'

/**
 * Renders the real signal path offline and measures it. Audio defects are
 * invisible to every other kind of test — the instrument typechecked, built and
 * played while clipping 44% of its samples — so the checks that matter here are
 * measurements of rendered sound, not assertions about code.
 *
 * Development only; `buildSynth` is shared with the live instrument so this
 * exercises the same graph the player hears.
 */

/** Every voice is measured, not just the default one: a voice is a set of
 *  levels, and a set of levels is something that can clip. */
const VOICES: TimbreId[] = TIMBRES.map((t) => t.id)
const RATE = 48000
const SECONDS = 0.6

export interface Measurement {
  label: string
  peak: number
  rms: number
  clipped: number
}

export interface TransitionMeasurement {
  label: string
  /** Largest sample-to-sample step during the chord change. */
  transitionStep: number
  /** The same measure while a chord is simply held, for comparison. */
  steadyStep: number
}

export interface StrikeMeasurement {
  label: string
  /** Quietest moment of the strike against the level it was holding. A strike
   *  that does not dip is not an articulation, it is a drone with a rumour. */
  dip: number
  /**
   * What this voice may dip to. Voices articulate differently on purpose — a
   * felt hammer is percussive and a pad merely notices the beat — so the check
   * asks whether each voice did what it declared, not whether they all behave
   * the same. A voice that declares a deep duck has to deliver one; every voice
   * has to do something.
   */
  ceiling: number
}

export interface AudioReport {
  levels: Measurement[]
  transitions: TransitionMeasurement[]
  strikes: StrikeMeasurement[]
  worstPeak: number
  totalClipped: number
}

const KEY = KEYS.find((k) => k.name === 'E')!

function chord(degree: number, voicing: number, major: boolean): number[] {
  return buildChord(KEY, { degree, major, voicing, octave: 0 })!.freqs
}

function analyse(buffer: AudioBuffer, label: string): Measurement {
  let peak = 0
  let sum = 0
  let clipped = 0
  let count = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i])
      if (a > peak) peak = a
      if (a > 1) clipped++
      sum += data[i] * data[i]
      count++
    }
  }
  return {
    label,
    peak: Number(peak.toFixed(3)),
    rms: Number(Math.sqrt(sum / count).toFixed(3)),
    clipped,
  }
}

/** RMS of a window, for asking whether something actually got quieter. */
function rms(buffer: AudioBuffer, from: number, to: number): number {
  let sum = 0
  let count = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    const start = Math.max(0, Math.floor(from * buffer.sampleRate))
    const end = Math.min(data.length, Math.floor(to * buffer.sampleRate))
    for (let i = start; i < end; i++) {
      sum += data[i] * data[i]
      count++
    }
  }
  return count ? Math.sqrt(sum / count) : 0
}

/** The deepest short-window dip across a strike, relative to the held level. */
function dipAt(buffer: AudioBuffer, at: number): number {
  const held = rms(buffer, at - 0.12, at - 0.02)
  if (!held) return 1
  let quietest = Infinity
  for (let t = at - 0.02; t < at + 0.08; t += 0.004) {
    quietest = Math.min(quietest, rms(buffer, t, t + 0.006))
  }
  return Number((quietest / held).toFixed(3))
}

/** Largest single-sample step within a time window — a click's signature. */
function maxStep(buffer: AudioBuffer, from: number, to: number): number {
  let worst = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    const start = Math.max(1, Math.floor(from * buffer.sampleRate))
    const end = Math.min(data.length, Math.floor(to * buffer.sampleRate))
    for (let i = start; i < end; i++) {
      const step = Math.abs(data[i] - data[i - 1])
      if (step > worst) worst = step
    }
  }
  return Number(worst.toFixed(4))
}

async function renderHeld(voice: TimbreId, freqs: number[], tilt: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE)
  const synth = buildSynth(ctx)
  synth.setTimbre(voice)
  synth.setTilt(tilt)
  synth.play(freqs)
  synth.setVolume(1)
  return ctx.startRendering()
}

/** Uses offline suspend/resume to change chord mid-render, as a player would. */
async function renderTransition(voice: TimbreId, from: number[], to: number[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE)
  const synth = buildSynth(ctx)
  synth.setTimbre(voice)
  synth.play(from)
  synth.setVolume(1)

  const at = SECONDS / 2
  void ctx.suspend(at).then(() => {
    synth.play(to)
    void ctx.resume()
  })
  return ctx.startRendering()
}

const KIT: Voice[] = ['kick', 'snare', 'hat']

/**
 * The loudest thing the instrument can now be asked to make: the densest chord,
 * full volume, filter wide open, with the whole kit landing on one downbeat.
 * Drums were added after the headroom was measured, so the measurement has to
 * be retaken — a mix that clips is not a drum bug, it is an instrument bug.
 */
async function renderMix(voice: TimbreId): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE)
  const synth = buildSynth(ctx)
  synth.setTimbre(voice)
  synth.setTilt(1)
  synth.play(chord(1, 4, true))
  synth.setVolume(1)

  const kit = buildKit(ctx, synth.mix)
  for (const drum of KIT) kit.trigger(drum, SECONDS / 3, 1)
  // The chord is struck on the same beat the kit lands on, which is the point
  // at which everything in the mix is loud at once.
  synth.strike(SECONDS / 3, 1)
  return ctx.startRendering()
}

/**
 * A strike on its own, to measure whether re-articulating a held chord clicks.
 * A duck and a fast attack are steps waiting to happen, and a step is a click.
 */
async function renderStrum(voice: TimbreId): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE)
  const synth = buildSynth(ctx)
  synth.setTimbre(voice)
  synth.play(chord(1, 1, true))
  synth.setVolume(1)
  synth.strike(SECONDS / 2, 1)
  return ctx.startRendering()
}

export async function runAudioCheck(): Promise<AudioReport> {
  const levels: Measurement[] = []

  for (const voice of VOICES) {
    for (let voicing = 1; voicing <= 4; voicing++) {
      for (const major of [true, false]) {
        // Full volume, filter wide open, resonance high: the loudest the
        // instrument can be asked to be.
        const freqs = chord(major ? 1 : 4, voicing, major)
        const buffer = await renderHeld(voice, freqs, 1)
        levels.push(analyse(buffer, `${voice} v${voicing} ${major ? 'maj' : 'min'}`))
      }
    }
  }

  for (const voice of VOICES) {
    levels.push(analyse(await renderMix(voice), `${voice} + kit + strum`))
  }

  const transitions: TransitionMeasurement[] = []
  for (const voice of VOICES) {
    // E to Am shares two pitches; both should be held, not retriggered.
    const buffer = await renderTransition(voice, chord(1, 1, true), chord(4, 1, false))
    const at = SECONDS / 2
    transitions.push({
      label: `${voice} I→iv`,
      transitionStep: maxStep(buffer, at - 0.01, at + 0.05),
      steadyStep: maxStep(buffer, 0.15, 0.35),
    })
  }

  const strikes: StrikeMeasurement[] = []
  for (const voice of VOICES) {
    const buffer = await renderStrum(voice)
    const at = SECONDS / 2
    transitions.push({
      label: `${voice} strum`,
      transitionStep: maxStep(buffer, at - 0.03, at + 0.05),
      steadyStep: maxStep(buffer, 0.15, 0.4),
    })
    const declared = TIMBRES.find((t) => t.id === voice)!.strike.depth
    strikes.push({ label: `${voice} strum`, dip: dipAt(buffer, at), ceiling: declared <= 0.15 ? 0.4 : 0.7 })
  }

  return {
    levels,
    transitions,
    strikes,
    worstPeak: Math.max(...levels.map((l) => l.peak)),
    totalClipped: levels.reduce((n, l) => n + l.clipped, 0),
  }
}
