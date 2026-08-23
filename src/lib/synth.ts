import { seeded } from './noise.ts'
import { DEFAULT_TIMBRE, timbreById, type Timbre, type TimbreId } from './timbre.ts'

/** Enough voices for a four-note chord plus the four it is replacing. */
const POOL = 8
/** Oscillators per pitch. Detuning near-unison voices is most of "pad". */
const UNISON = 3
const PAN_SPREAD = 0.55
/**
 * When a change keeps no common tones — an octave jump moves every voice — the
 * seam is far wider and a 14ms crossfade reads as a lurch. Longer here is not
 * sloppier: it is proportionate to how much of the sound is being replaced.
 */
const REVOICE_FADE = 0.09
/** How long a firmly placed chord takes to settle back to its held level. */
const SETTLE = 0.07
/**
 * Spacing between voices when a chord is strummed rather than switched.
 *
 * Deliberately small. A strum is a progressive arrival, so until it finishes
 * the chord is genuinely incomplete — starting one from silence at thirty
 * milliseconds left the organ voice at a fifth of its level partway through,
 * which reads as a hole rather than as a strum. Enough to hear the notes land
 * separately, not enough to hear the chord go missing.
 */
const STRUM_MAX = 0.011
/** How much above the held level the firmest placement arrives. */
const OVERSHOOT_MAX = 0.35

/** Slow, shallow, mutually prime: a held chord breathes instead of sitting still.
 *  How far it drifts is the voice's business; how it drifts is the instrument's. */
const DRIFT_RATES = [0.07, 0.11, 0.13]

const REFERENCE_HZ = 220
/** Shared by every voice: swapping a convolver's buffer mid-note clicks, and wet
 *  plus pre-delay carry most of the difference between one room and another. */

/**
 * Articulation. A chord that is merely held is a drone; a play-along needs it to
 * land *on* the beat. A strike ducks into the hit and attacks out of it, and the
 * voices are offset low to high so it reads as a strum rather than a stab.
 */
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

const REVERB_SECONDS = 2.4

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
  /** The way into the same room the chords sit in. A little of the kit through
   *  here is what makes a backing beat sound like it is in the recording rather
   *  than next to it — a lot of it is mud, which is why the kit is otherwise dry. */
  room: AudioNode
  setTimbre(id: TimbreId): void
  setVolume(level: number): void
  setTilt(tilt: number): void
  play(freqs: number[], expression?: Expression): void
  /** Re-articulates whatever is already sounding, at a scheduled time. */
  strike(at: number, velocity: number): void
  stop(): void
}

/**
 * What a backing track needs from the instrument: its clock, the bus that shares
 * its limiter, and a way to re-articulate the chord the player is holding.
 */
/** How a chord was placed, as opposed to which chord it is. */
export interface Expression {
  /** 0 eased in, 1 placed firmly. Tightens the strum and lifts the arrival. */
  velocity: number
}

export interface AudioBridge {
  context: BaseAudioContext
  destination: AudioNode
  /** The chords' room, for anything that should sound like it is in it. */
  room: AudioNode
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

  /** Waveform and unison spread: outer members detuned, centre left true. */
  setTone(wave: OscillatorType, detuneCents: number): void {
    this.oscillators.forEach((osc, u) => {
      osc.type = wave
      osc.detune.value = (u - (UNISON - 1) / 2) * detuneCents
    })
  }

  /**
   * Retunes while silent, then fades in — so the pitch change itself is
   * inaudible. `overshoot` lets a firmly placed chord arrive above its held
   * level and settle back, which is an articulation rather than an envelope:
   * the hand still decides how loud the chord stays.
   */
  attack(freq: number, at: number, fade: number, overshoot = 0): void {
    this.freq = freq
    for (const osc of this.oscillators) osc.frequency.setValueAtTime(freq, at)
    if (overshoot <= 0) {
      this.ramp(this.level, at, fade)
      return
    }
    this.ramp(this.level * (1 + overshoot), at, fade)
    for (const gain of this.gains) gain.gain.setTargetAtTime(this.level, at + fade, SETTLE)
  }

  /**
   * Re-articulate: duck, hit, settle back to the held level, without touching
   * pitch. A silent voice stays silent — a strike shapes what is sounding, it
   * does not start anything.
   */
  strike(at: number, velocity: number, delay: number, shape: Timbre['strike']): void {
    if (this.freq === null) return
    const peak = this.level * (STRIKE_FLOOR + STRIKE_RANGE * velocity)
    for (const gain of this.gains) {
      // Anchored before the duck: a ramp with no recent event interpolates from
      // wherever the last one was, which would start the fall minutes early.
      gain.gain.cancelScheduledValues(at - shape.duck)
      gain.gain.setValueAtTime(this.level, at - shape.duck)
      gain.gain.linearRampToValueAtTime(this.level * shape.depth, at)
      gain.gain.linearRampToValueAtTime(peak, at + delay + shape.attack)
      gain.gain.linearRampToValueAtTime(this.level, at + delay + shape.attack + shape.settle)
    }
  }

  release(at: number, fade: number): void {
    this.freq = null
    this.ramp(0, at, fade)
  }

  private ramp(to: number, at: number, fade: number): void {
    for (const gain of this.gains) {
      gain.gain.cancelScheduledValues(at)
      gain.gain.setValueAtTime(gain.gain.value, at)
      gain.gain.linearRampToValueAtTime(to, at + fade)
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
    drift.gain.value = 0
    lfo.connect(drift)
    lfo.start()

    return { input, panner, drift }
  })

  const drive = ctx.createWaveShaper()
  drive.oversample = '4x'

  // Two poles cascaded: 24 dB/oct, with resonance on the first stage only.
  const filterA = ctx.createBiquadFilter()
  const filterB = ctx.createBiquadFilter()
  for (const f of [filterA, filterB]) {
    f.type = 'lowpass'
  }

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
  const preDelay = ctx.createDelay(0.2)
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
  let timbre: Timbre = timbreById(DEFAULT_TIMBRE)

  function updateFilter(): void {
    const f = timbre.filter
    const base = f.centre + (tilt < 0 ? tilt * f.inwardHz : tilt * f.outwardHz)
    const tracked = base * Math.pow(rootHz / REFERENCE_HZ, f.keyTrack)
    const q = f.q + Math.abs(tilt) * (tilt < 0 ? f.inwardQ : f.outwardQ)
    const now = ctx.currentTime
    const cutoff = Math.min(Math.max(tracked, 60), 18000)
    filterA.frequency.setTargetAtTime(cutoff, now, FILTER_GLIDE)
    filterB.frequency.setTargetAtTime(cutoff, now, FILTER_GLIDE)
    filterA.Q.setTargetAtTime(q, now, FILTER_GLIDE)
    filterB.Q.setTargetAtTime(f.q, now, FILTER_GLIDE)
    resonanceTrim.gain.setTargetAtTime(1 / (1 + (q - f.q) * 0.18), now, FILTER_GLIDE)
  }

  const subLevel = () => level * timbre.sub * UNISON
  const sounding = () => voices.some((v) => v.busy)

  /**
   * Everything a voice owns, applied at once. Called on every change of voice
   * and once at build time, so there is exactly one description of what a voice
   * *is* and no second place for it to drift out of date.
   */
  function applyTimbre(): void {
    for (const voice of voices) voice.setTone(timbre.wave, timbre.detuneCents)
    for (const bus of buses) bus.drift.gain.value = timbre.driftCents
    drive.curve = saturation(timbre.drive)
    wet.gain.value = timbre.reverb.wet
    dry.gain.value = 1 - timbre.reverb.wet * 0.5
    preDelay.delayTime.value = timbre.reverb.preDelay
    subGain.gain.setTargetAtTime(sounding() ? subLevel() : 0, ctx.currentTime, timbre.fade)
    updateFilter()
  }

  applyTimbre()

  return {
    mix: dcBlock,
    room: preDelay,

    setTimbre(id) {
      timbre = timbreById(id)
      applyTimbre()
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
    play(freqs, expression) {
      const now = ctx.currentTime
      // A chord placed briskly arrives tighter and harder than one eased into.
      const force = Math.min(1, Math.max(0, expression?.velocity ?? 0))
      const strum = STRUM_MAX * (1 - force)
      const overshoot = OVERSHOOT_MAX * force
      const wanted = freqs.map((f) => Math.round(f * 10) / 10)

      // Nothing held over means the whole chord is being replaced, and the
      // crossfade should be proportionate to that rather than to a single note.
      const retained = wanted.some((f) => voices.some((v) => v.freq === f))
      const fade = retained ? timbre.fade : REVOICE_FADE

      // Low to high, spaced, so a chord sounds played rather than switched on.
      //
      // Departures are staggered to match the arrivals rather than happening
      // all at once. A strum replaces notes one at a time; releasing everything
      // at the start of one leaves a hole in the middle of the chord, which is
      // audible as a dip and is what the articulation check measures.
      const departing = voices.filter((v) => v.freq !== null && !wanted.includes(v.freq))
      const arriving = wanted.filter((f) => !voices.some((v) => v.freq === f))

      arriving.forEach((freq, i) => {
        const at = now + i * strum
        // Claim the free voice before releasing the one it replaces, or the
        // voice being released would be free to claim and would fight itself.
        const free = voices.find((v) => !v.busy)
        free?.attack(freq, at, fade, overshoot)
        departing[i]?.release(at, fade)
      })
      // Anything with no replacement leaves once the strum has finished.
      for (const voice of departing.slice(arriving.length)) {
        voice.release(now + Math.max(0, arriving.length - 1) * strum, fade)
      }

      rootHz = Math.min(...wanted)
      sub.frequency.setTargetAtTime(rootHz / 2, now, 0.02)
      subGain.gain.setTargetAtTime(subLevel(), now, timbre.fade)
      updateFilter()
    },

    /**
     * Every voice ducks together and they attack low to high — which is what a
     * hand crossing strings actually does, and the only version of this that is
     * audible: staggering the duck as well leaves three voices covering for the
     * one that is quiet, and the chord never stops.
     */
    strike(at, velocity) {
      const ringing = voices.filter((v) => v.busy).sort((a, b) => (a.freq ?? 0) - (b.freq ?? 0))
      ringing.forEach((voice, i) => voice.strike(at, velocity, i * timbre.strike.spread, timbre.strike))

      // The sub is part of the chord's body; leaving it up fills the gap the
      // strike just made.
      const body = subLevel()
      subGain.gain.cancelScheduledValues(at - timbre.strike.duck)
      subGain.gain.setValueAtTime(body, at - timbre.strike.duck)
      subGain.gain.linearRampToValueAtTime(body * timbre.strike.depth, at)
      subGain.gain.linearRampToValueAtTime(body, at + timbre.strike.attack + timbre.strike.settle)
    },

    stop() {
      const now = ctx.currentTime
      for (const voice of voices) voice.release(now, timbre.fade)
      subGain.gain.setTargetAtTime(0, now, timbre.fade)
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
    // Seeded per channel: the two sides must decorrelate, and the room must be
    // the same room on every build or the audio checks measure the dice.
    const random = seeded(0x51f0 + channel)
    let previous = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      // One-pole lowpass on the noise takes the fizz off the tail.
      previous = previous * 0.68 + (random() * 2 - 1) * 0.32
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
  private timbre: TimbreId = DEFAULT_TIMBRE

  async start(): Promise<void> {
    if (this.ctx) return
    // Ask for the smallest buffer the device will give us: this is an
    // instrument, and latency is felt directly in the hands.
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.graph = buildSynth(this.ctx)
    this.graph.setTimbre(this.timbre)
    await this.ctx.resume()
  }

  /** Null until the player has started. */
  get audio(): AudioBridge | null {
    if (!this.ctx || !this.graph) return null
    const graph = this.graph
    return {
      context: this.ctx,
      destination: graph.mix,
      room: graph.room,
      strike: (at, velocity) => graph.strike(at, velocity),
    }
  }

  /** Output latency in ms, for the latency budget. */
  get latencyMs(): number {
    if (!this.ctx) return 0
    return (this.ctx.baseLatency + (this.ctx.outputLatency || 0)) * 1000
  }

  setTimbre(id: TimbreId): void {
    this.timbre = id
    this.graph?.setTimbre(id)
  }

  setVolume(level: number): void {
    this.graph?.setVolume(level)
  }

  setTilt(tilt: number): void {
    this.graph?.setTilt(tilt)
  }

  play(freqs: number[], expression?: Expression): void {
    this.graph?.play(freqs, expression)
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
