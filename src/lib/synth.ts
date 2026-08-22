export type Wave = 'triangle' | 'sawtooth' | 'square'

/** Enough voices for a four-note chord plus the four it is replacing. */
const POOL = 8
/** Oscillators per pitch. Detuning near-unison voices is most of "pad". */
const UNISON = 3
const DETUNE_CENTS = 7
const PAN_SPREAD = 0.55
/** Long enough to hide the transition, short enough not to read as articulation. */
const FADE = 0.014

/** Slow, shallow, mutually prime: a held chord breathes instead of sitting still. */
const DRIFT_RATES = [0.07, 0.11, 0.13]
const DRIFT_CENTS = 3.5

const CENTRE_HZ = 1200
const CENTRE_Q = 0.7
const INWARD_HZ = 950
const INWARD_Q = 1.5
const OUTWARD_HZ = 3800
const OUTWARD_Q = 4.5
/** Cutoff follows the chord root, so high voicings don't go dull. */
const KEY_TRACK = 0.35
const REFERENCE_HZ = 220

/**
 * Articulation. A chord that is merely held is a drone; a play-along needs it to
 * land *on* the beat. A strike ducks into the hit and attacks out of it, and the
 * voices are offset low to high so it reads as a strum rather than a stab.
 */
const STRIKE_DUCK = 0.016
const STRIKE_DEPTH = 0.22
const STRIKE_ATTACK = 0.008
const STRIKE_SETTLE = 0.09
const STRUM_SPREAD = 0.011
/** Accents overshoot the held level a little; soft strikes sit under it. */
const STRIKE_FLOOR = 0.6
const STRIKE_RANGE = 0.45

const GAIN_GLIDE = 0.03
const FILTER_GLIDE = 0.04

/**
 * Per-oscillator level. Normalising by count alone is far too quiet, and by its
 * square root leaves peaks the limiter has to chew on; the exponent between
 * splits the difference, and the measured headroom trim then puts the worst
 * case safely under full scale. Verified by `npm run audio`.
 */
const VOICE_EXPONENT = 0.75
const HEADROOM = 0.62

const SUB_LEVEL = 0.22
const DRIVE = 1.6
const REVERB_SECONDS = 2.4
const REVERB_WET = 0.22
const PRE_DELAY = 0.025

/** One stereo position, shared by the unison members that sit at it. */
interface Bus {
  input: GainNode
  panner: StereoPannerNode
  drift: GainNode
}

/** Control surface over a built graph, independent of how the context is driven. */
export interface SynthGraph {
  /** Where percussion joins: after the chord's reverb, before the limiter. A
   *  drum through a 2.4-second convolution is mud, and the limiter is the only
   *  thing protecting the sum of the two. */
  mix: AudioNode
  setWave(wave: Wave): void
  setVolume(level: number): void
  setTilt(tilt: number): void
  play(freqs: number[]): void
  /** Re-articulates whatever is already sounding, at a scheduled time. */
  strike(at: number, velocity: number): void
  stop(): void
}

/**
 * What a backing track needs from the instrument: its clock, the bus that shares
 * its limiter, and a way to re-articulate the chord the player is holding.
 */
export interface AudioBridge {
  context: BaseAudioContext
  destination: AudioNode
  strike(at: number, velocity: number): void
}

/**
 * One pitch, held by oscillators that are never stopped. Changing chord moves
 * gain, never lifecycle: stopping a running oscillator mid-cycle and starting a
 * replacement at phase zero is a step discontinuity, which is a click. Voices
 * are retuned only while silent, so no transition is ever audible as a glitch.
 */
class Voice {
  readonly oscillators: OscillatorNode[] = []
  private readonly gains: GainNode[] = []
  freq: number | null = null

  constructor(ctx: BaseAudioContext, buses: Bus[], level: number) {
    for (let u = 0; u < UNISON; u++) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      // Spread across the unison: outer members detuned, centre left true.
      osc.detune.value = (u - (UNISON - 1) / 2) * DETUNE_CENTS
      const gain = ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain).connect(buses[u].input)
      osc.start()
      this.oscillators.push(osc)
      this.gains.push(gain)
    }
    this.level = level
  }

  private level: number

  get busy(): boolean {
    return this.freq !== null
  }

  setWave(wave: Wave): void {
    for (const osc of this.oscillators) osc.type = wave
  }

  /** Retunes while silent, then fades in — so the pitch change itself is inaudible. */
  attack(freq: number, at: number): void {
    this.freq = freq
    for (const osc of this.oscillators) osc.frequency.setValueAtTime(freq, at)
    for (const gain of this.gains) {
      gain.gain.cancelScheduledValues(at)
      gain.gain.setValueAtTime(gain.gain.value, at)
      gain.gain.linearRampToValueAtTime(this.level, at + FADE)
    }
  }

  /**
   * Re-articulate: duck, hit, settle back to the held level, without touching
   * pitch. A silent voice stays silent — a strike shapes what is sounding, it
   * does not start anything.
   */
  strike(at: number, velocity: number, delay: number): void {
    if (this.freq === null) return
    const peak = this.level * (STRIKE_FLOOR + STRIKE_RANGE * velocity)
    for (const gain of this.gains) {
      // Anchored before the duck: a ramp with no recent event interpolates from
      // wherever the last one was, which would start the fall minutes early.
      gain.gain.cancelScheduledValues(at - STRIKE_DUCK)
      gain.gain.setValueAtTime(this.level, at - STRIKE_DUCK)
      gain.gain.linearRampToValueAtTime(this.level * STRIKE_DEPTH, at)
      gain.gain.linearRampToValueAtTime(peak, at + delay + STRIKE_ATTACK)
      gain.gain.linearRampToValueAtTime(this.level, at + delay + STRIKE_ATTACK + STRIKE_SETTLE)
    }
  }

  release(at: number): void {
    this.freq = null
    for (const gain of this.gains) {
      gain.gain.cancelScheduledValues(at)
      gain.gain.setValueAtTime(gain.gain.value, at)
      gain.gain.linearRampToValueAtTime(0, at + FADE)
    }
  }
}

/**
 * Builds the whole instrument on any context — live or offline. Keeping this
 * independent of `AudioContext` is what lets the audio checks render and measure
 * the real signal path rather than a stand-in.
 */
export function buildSynth(ctx: BaseAudioContext): SynthGraph {
  const level = (HEADROOM / Math.pow(POOL * UNISON, VOICE_EXPONENT)) * UNISON

  // Three stereo positions shared by every voice's unison members: width comes
  // from decorrelated signals sitting apart, not from one panned source.
  const buses: Bus[] = Array.from({ length: UNISON }, (_, u) => {
    const input = ctx.createGain()
    const panner = ctx.createStereoPanner()
    panner.pan.value = ((u - (UNISON - 1) / 2) / ((UNISON - 1) / 2 || 1)) * PAN_SPREAD
    input.connect(panner)

    // Drift: one slow LFO per stereo position, fanned out to every voice at
    // that position, so unison members wander relative to each other rather
    // than together — which would just be vibrato.
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = DRIFT_RATES[u % DRIFT_RATES.length]
    const drift = ctx.createGain()
    drift.gain.value = DRIFT_CENTS
    lfo.connect(drift)
    lfo.start()

    return { input, panner, drift }
  })

  const drive = ctx.createWaveShaper()
  drive.curve = saturation(DRIVE)
  drive.oversample = '4x'

  // Two poles cascaded: 24 dB/oct, with resonance on the first stage only.
  const filterA = ctx.createBiquadFilter()
  const filterB = ctx.createBiquadFilter()
  for (const f of [filterA, filterB]) {
    f.type = 'lowpass'
    f.frequency.value = CENTRE_HZ
    f.Q.value = CENTRE_Q
  }
  filterB.Q.value = CENTRE_Q

  // Resonance adds level as well as colour; this takes it back out.
  const resonanceTrim = ctx.createGain()
  const master = ctx.createGain()
  master.gain.value = 0

  for (const bus of buses) bus.panner.connect(drive)
  drive.connect(filterA).connect(filterB).connect(resonanceTrim).connect(master)

  // Weight under the root. A sine adds body without adding harshness.
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  const subGain = ctx.createGain()
  subGain.gain.value = 0
  sub.connect(subGain).connect(drive)
  sub.start()

  const voices = Array.from({ length: POOL }, () => new Voice(ctx, buses, level))
  buses.forEach((bus, u) => {
    for (const voice of voices) bus.drift.connect(voice.oscillators[u].detune)
  })

  // Reverb sits after the hand's volume, so tails decay naturally when a hand
  // drops rather than being cut off with the source.
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  wet.gain.value = REVERB_WET
  dry.gain.value = 1 - REVERB_WET * 0.5
  const preDelay = ctx.createDelay(0.2)
  preDelay.delayTime.value = PRE_DELAY
  const reverb = ctx.createConvolver()
  reverb.buffer = impulseResponse(ctx, REVERB_SECONDS)
  master.connect(dry)
  master.connect(preDelay).connect(reverb).connect(wet)

  // Output conditioning: block DC the saturator introduces, then limit.
  const dcBlock = ctx.createBiquadFilter()
  dcBlock.type = 'highpass'
  dcBlock.frequency.value = 20
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.08
  const out = ctx.createGain()
  out.gain.value = 0.9

  dry.connect(dcBlock)
  wet.connect(dcBlock)
  dcBlock.connect(limiter).connect(out).connect(ctx.destination)

  let tilt = 0
  let rootHz = REFERENCE_HZ

  function updateFilter(): void {
    const base = CENTRE_HZ + (tilt < 0 ? tilt * INWARD_HZ : tilt * OUTWARD_HZ)
    const tracked = base * Math.pow(rootHz / REFERENCE_HZ, KEY_TRACK)
    const q = CENTRE_Q + Math.abs(tilt) * (tilt < 0 ? INWARD_Q : OUTWARD_Q)
    const now = ctx.currentTime
    const cutoff = Math.min(Math.max(tracked, 60), 18000)
    filterA.frequency.setTargetAtTime(cutoff, now, FILTER_GLIDE)
    filterB.frequency.setTargetAtTime(cutoff, now, FILTER_GLIDE)
    filterA.Q.setTargetAtTime(q, now, FILTER_GLIDE)
    resonanceTrim.gain.setTargetAtTime(1 / (1 + (q - CENTRE_Q) * 0.18), now, FILTER_GLIDE)
  }
  updateFilter()

  return {
    mix: dcBlock,

    setWave(wave) {
      for (const voice of voices) voice.setWave(wave)
    },

    setVolume(value) {
      const clamped = Math.min(1, Math.max(0, value))
      master.gain.setTargetAtTime(clamped, ctx.currentTime, GAIN_GLIDE)
    },

    setTilt(value) {
      tilt = value
      updateFilter()
    },

    /** Holds common tones untouched; only what changed moves. */
    play(freqs) {
      const now = ctx.currentTime
      const wanted = freqs.map((f) => Math.round(f * 10) / 10)

      for (const voice of voices) {
        if (voice.freq !== null && !wanted.includes(voice.freq)) voice.release(now)
      }
      for (const freq of wanted) {
        if (voices.some((v) => v.freq === freq)) continue
        const free = voices.find((v) => !v.busy)
        free?.attack(freq, now)
      }

      rootHz = Math.min(...wanted)
      sub.frequency.setTargetAtTime(rootHz / 2, now, 0.02)
      subGain.gain.setTargetAtTime(level * SUB_LEVEL * UNISON, now, FADE)
      updateFilter()
    },

    /**
     * Every voice ducks together and they attack low to high — which is what a
     * hand crossing strings actually does, and the only version of this that is
     * audible: staggering the duck as well leaves three voices covering for the
     * one that is quiet, and the chord never stops.
     */
    strike(at, velocity) {
      const sounding = voices.filter((v) => v.busy).sort((a, b) => (a.freq ?? 0) - (b.freq ?? 0))
      sounding.forEach((voice, i) => voice.strike(at, velocity, i * STRUM_SPREAD))

      // The sub is part of the chord's body; leaving it up fills the gap the
      // strike just made.
      const subLevel = level * SUB_LEVEL * UNISON
      subGain.gain.cancelScheduledValues(at - STRIKE_DUCK)
      subGain.gain.setValueAtTime(subLevel, at - STRIKE_DUCK)
      subGain.gain.linearRampToValueAtTime(subLevel * STRIKE_DEPTH, at)
      subGain.gain.linearRampToValueAtTime(subLevel, at + STRIKE_ATTACK + STRIKE_SETTLE)
    },

    stop() {
      const now = ctx.currentTime
      for (const voice of voices) voice.release(now)
      subGain.gain.setTargetAtTime(0, now, FADE)
      master.gain.setTargetAtTime(0, now, GAIN_GLIDE)
    },
  }
}

/** tanh-style soft clip, normalised so unity in stays unity out. */
function saturation(amount: number): Float32Array<ArrayBuffer> {
  const n = 2048
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT))
  const norm = Math.tanh(amount)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1
    curve[i] = Math.tanh(x * amount) / norm
  }
  return curve
}

/**
 * Decaying filtered noise, generated rather than shipped: an impulse response
 * file would be the largest asset in the project, and this is indistinguishable
 * for a pad.
 */
function impulseResponse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let previous = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      // One-pole lowpass on the noise takes the fizz off the tail.
      previous = previous * 0.68 + (Math.random() * 2 - 1) * 0.32
      // Fade the first milliseconds in, or the tail starts with a click.
      const onset = Math.min(1, i / (ctx.sampleRate * 0.005))
      data[i] = previous * Math.pow(1 - t, 2.6) * onset
    }
  }
  return buffer
}

/** Live wrapper: owns the AudioContext, delegates the sound to `buildSynth`. */
export class Synth {
  private ctx: AudioContext | null = null
  private graph: SynthGraph | null = null
  private wave: Wave = 'triangle'

  async start(): Promise<void> {
    if (this.ctx) return
    // Ask for the smallest buffer the device will give us: this is an
    // instrument, and latency is felt directly in the hands.
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.graph = buildSynth(this.ctx)
    this.graph.setWave(this.wave)
    await this.ctx.resume()
  }

  /** Null until the player has started. */
  get audio(): AudioBridge | null {
    if (!this.ctx || !this.graph) return null
    const graph = this.graph
    return {
      context: this.ctx,
      destination: graph.mix,
      strike: (at, velocity) => graph.strike(at, velocity),
    }
  }

  /** Output latency in ms, for the latency budget. */
  get latencyMs(): number {
    if (!this.ctx) return 0
    return (this.ctx.baseLatency + (this.ctx.outputLatency || 0)) * 1000
  }

  setWave(wave: Wave): void {
    this.wave = wave
    this.graph?.setWave(wave)
  }

  setVolume(level: number): void {
    this.graph?.setVolume(level)
  }

  setTilt(tilt: number): void {
    this.graph?.setTilt(tilt)
  }

  play(freqs: number[]): void {
    this.graph?.play(freqs)
  }

  stop(): void {
    this.graph?.stop()
  }

  dispose(): void {
    this.graph?.stop()
    void this.ctx?.close()
    this.ctx = null
    this.graph = null
  }
}
