import type { Voice } from './groove.ts'
import { fillNoise } from './noise.ts'

/**
 * A kit, synthesised. Four voices from one noise buffer and a handful of
 * envelopes — the same reasoning that removed Tone.js in S1 applies to a drum
 * sample library: nothing here needs megabytes of audio.
 */

export interface DrumKit {
  trigger(voice: Voice, time: number, gain: number): void
  dispose(): void
}

/** Under the chords, always. Drums that compete with the instrument are a toy. */
const LEVEL = 0.34

const KICK_FROM = 110
const KICK_TO = 45
const KICK_PITCH_FALL = 0.06
const KICK_DECAY = 0.24

const SNARE_HZ = 1750
const SNARE_Q = 0.9
const SNARE_BODY_HZ = 185
const SNARE_DECAY = 0.16

const HAT_HZ = 7200
const HAT_DECAY = 0.045

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
export function buildKit(ctx: BaseAudioContext, destination: AudioNode): DrumKit {
  const level = ctx.createGain()
  level.gain.value = LEVEL
  level.connect(destination)

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
        osc.frequency.exponentialRampToValueAtTime(KICK_TO, time + KICK_PITCH_FALL)
        osc.connect(envelope(time, gain, KICK_DECAY))
        osc.start(time)
        osc.stop(time + KICK_DECAY + 0.02)
        return
      }

      if (voice === 'snare') {
        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = SNARE_HZ
        band.Q.value = SNARE_Q
        band.connect(envelope(time, gain * 0.7, SNARE_DECAY))
        noiseSource(time, SNARE_DECAY).connect(band)

        const body = ctx.createOscillator()
        body.type = 'triangle'
        body.frequency.value = SNARE_BODY_HZ
        body.connect(envelope(time, gain * 0.35, SNARE_DECAY * 0.6))
        body.start(time)
        body.stop(time + SNARE_DECAY)
        return
      }

      const decay = voice === 'crash' ? CRASH_DECAY : HAT_DECAY
      const high = ctx.createBiquadFilter()
      high.type = 'highpass'
      high.frequency.value = voice === 'crash' ? CRASH_HZ : HAT_HZ
      high.connect(envelope(time, gain * (voice === 'crash' ? 0.55 : 1), decay))
      noiseSource(time, decay).connect(high)
    },

    dispose() {
      level.disconnect()
    },
  }
}
