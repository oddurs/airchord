import type { Voice } from './groove.ts'
import { fillNoise } from './noise.ts'

/**
 * A kit, synthesised. Four voices from one noise buffer and a handful of
 * envelopes — the same reasoning that removed Tone.js in S1 applies to a drum
 * sample library: nothing here needs megabytes of audio.
 */

/** The few numbers that decide whether the kit belongs under this voice. */
export interface KitVoicing {
  kickHz: number
  kickDecay: number
  snareHz: number
  snareQ: number
  snareDecay: number
  hatHz: number
  hatDecay: number
  level: number
  room: number
}

export const DEFAULT_VOICING: KitVoicing = {
  kickHz: 45,
  kickDecay: 0.24,
  snareHz: 1750,
  snareQ: 0.9,
  snareDecay: 0.16,
  hatHz: 7200,
  hatDecay: 0.045,
  level: 0.34,
  room: 0,
}

export interface KitOptions {
  voicing?: KitVoicing
  /** Where a little of the kit goes to share the chords' room. */
  room?: AudioNode
}

export interface DrumKit {
  trigger(voice: Voice, time: number, gain: number): void
  dispose(): void
}

const KICK_FROM = 110
const KICK_PITCH_FALL = 0.06

const SNARE_BODY_HZ = 185


/** Section boundaries. Long enough to be a cymbal, short enough not to wash. */
const CRASH_HZ = 3400
const CRASH_DECAY = 1.1

const ATTACK = 0.002
const NOISE_SECONDS = 1

/**
 * Percussion shares the limiter but not the chord reverb: a snare through a
 * 2.4-second convolution is mud, and the limiter is the only thing protecting
 * the sum of the two from clipping.
 */
export function buildKit(ctx: BaseAudioContext, destination: AudioNode, options: KitOptions = {}): DrumKit {
  const voicing = options.voicing ?? DEFAULT_VOICING
  const level = ctx.createGain()
  level.gain.value = voicing.level
  level.connect(destination)

  // A send rather than a routing choice: the kit stays dry, and a measured
  // fraction of it goes where the chords already are.
  if (options.room && voicing.room > 0) {
    const send = ctx.createGain()
    send.gain.value = voicing.room
    level.connect(send).connect(options.room)
  }

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate)
  fillNoise(noise.getChannelData(0), 0x4b17)

  function envelope(time: number, peak: number, decay: number): GainNode {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(peak, time + ATTACK)
    // Exponential to a floor rather than to zero: a ramp to zero is illegal and
    // silently does nothing, which sounds like a stuck note.
    gain.gain.exponentialRampToValueAtTime(peak * 0.001, time + decay)
    gain.connect(level)
    return gain
  }

  function noiseSource(time: number, decay: number): AudioBufferSourceNode {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    // A different slice each hit, so repeated hats do not phase into a tone.
    source.start(time, Math.random() * Math.max(0.01, NOISE_SECONDS - decay - 0.01))
    source.stop(time + decay + 0.02)
    return source
  }

  return {
    trigger(voice, time, gain) {
      if (voice === 'kick') {
        const osc = ctx.createOscillator()
        osc.frequency.setValueAtTime(KICK_FROM, time)
        osc.frequency.exponentialRampToValueAtTime(voicing.kickHz, time + KICK_PITCH_FALL)
        osc.connect(envelope(time, gain, voicing.kickDecay))
        osc.start(time)
        osc.stop(time + voicing.kickDecay + 0.02)
        return
      }

      if (voice === 'snare') {
        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = voicing.snareHz
        band.Q.value = voicing.snareQ
        band.connect(envelope(time, gain * 0.7, voicing.snareDecay))
        noiseSource(time, voicing.snareDecay).connect(band)

        const body = ctx.createOscillator()
        body.type = 'triangle'
        body.frequency.value = SNARE_BODY_HZ
        body.connect(envelope(time, gain * 0.35, voicing.snareDecay * 0.6))
        body.start(time)
        body.stop(time + voicing.snareDecay)
        return
      }

      const decay = voice === 'crash' ? CRASH_DECAY : voicing.hatDecay
      const high = ctx.createBiquadFilter()
      high.type = 'highpass'
      high.frequency.value = voice === 'crash' ? CRASH_HZ : voicing.hatHz
      high.connect(envelope(time, gain * (voice === 'crash' ? 0.55 : 1), decay))
      noiseSource(time, decay).connect(high)
    },

    dispose() {
      level.disconnect()
    },
  }
}
