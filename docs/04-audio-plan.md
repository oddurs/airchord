# Audio quality: audit and sprint log

The instrument was musically correct and sonically amateur. This is what was wrong — measured rather
than asserted — and what was done about it. **A1–A5 are complete; A6 ships as `npm run audio`.**

## Result

| | Before | After |
|---|---|---|
| Worst true peak | 4.665 | **0.828** |
| Clipped samples (per 1s render) | up to 26,026 | **0** |
| Chord-change step vs steady state | — | **1.00×** |

A step ratio of 1.00 means a chord change is, sample for sample, indistinguishable from holding one:
the clicks are gone entirely rather than merely quieter.

## Audit

The current chain is four bare oscillators → transparent waveshaper → one 12 dB/oct lowpass →
master gain → output. Mono, dry, no envelopes, no headroom management.

### 1. The output clips catastrophically

Rendering the exact current graph offline — an Am voicing, master gain at the 1.0 it reaches
whenever a hand is raised — gives:

| Waveform | True peak | Samples clipped (of 44,100) |
|---|---|---|
| Triangle | 3.37 | 19,573 — **44%** |
| Sawtooth | 3.07 | 12,936 — **29%** |
| Square | 4.67 | 26,026 — **59%** |

Four voices connect at unity gain and sum, so the graph can hand the output stage a signal more than
four times full scale. Everything above 1.0 is hard-clipped by the audio device. This is the single
largest quality defect, it affects every note played loudly, and it makes every other improvement
inaudible until fixed. **Nothing else in this plan matters first.**

### 2. Every chord change rebuilds every voice

`play()` stops all oscillators and constructs new ones. Two consequences:

- **Clicks.** A running oscillator stopped mid-cycle and replaced by one starting at phase zero is a
  step discontinuity — broadband click, on every chord change.
- **No voice leading.** Common tones between chords are torn down and restarted rather than held.
  E → Am shares two pitches; both currently retrigger. An earlier implementation diffed the pitch
  sets and only moved what changed; that was lost when the Tone.js dependency was dropped, and it
  should come back.

### 3. Thin, mono, dry

One oscillator per pitch, no detuning, no stereo image, no space. Four exactly-tuned oscillators is
an organ, not a synth pad — the richness of a professional pad comes from slight detuning between
near-unison voices, stereo spread, and a reverb tail.

### 4. Unused and under-specified stages

The `WaveShaper` is wired with a transparent curve. The filter is a single 12 dB/oct biquad with no
drive, no key tracking, and no resonance compensation — so closing the filter also drops perceived
loudness. The `AudioContext` is created without `latencyHint`, so the browser picks a buffer size
for it.

## What was built

### A1 — Gain staging and output safety ✅

1. **Per-voice gain and a headroom budget.** Voices sum through their own gain nodes; the sum targets
   roughly −6 dBFS peak, not +12.
2. **Master conditioning chain**: DC-blocking highpass (~20 Hz) → soft saturator → limiter. A
   `DynamicsCompressorNode` is the pragmatic interim limiter; a lookahead limiter in an
   `AudioWorklet` is the honest version, and worth it since the worklet is also wanted for A5.
3. **`latencyHint: 'interactive'`** on the context.
4. **Make it a regression test.** The measurement above is an `OfflineAudioContext` render — turn it
   into an automated check asserting true peak ≤ 1.0 across every waveform, every voicing, and full
   gain. Clipping is exactly the kind of defect that returns silently.

Per-oscillator level is normalised by voice count raised to 0.75 — normalising by count alone is far
too quiet, by its square root leaves peaks the limiter has to chew on — then trimmed by a measured
headroom constant. The master chain is DC-blocking highpass → soft-clip limiter → output trim, and
the context is created with `latencyHint: 'interactive'` because latency on an instrument is felt in
the hands.

*Verified:* no voicing, at any waveform, at full volume and full resonance, exceeds 1.0.

### A2 — Voice architecture and click-free transitions ✅

1. **Persistent voice pool.** Allocate a fixed set of voices once; changing chord retunes them
   instead of rebuilding them.
2. **Voice leading.** Diff pitch sets and hold common tones — restore what was lost with Tone.js.
3. **Equal-power crossfade** on the voices that do change, in the 8–20 ms range: short enough to feel
   immediate, long enough to remove the step.
4. Ramp every voice gain from zero on entry rather than starting at full amplitude.

The architectural decision that made this simple: **oscillators are never stopped.** A pool of eight
voices starts at context creation and runs for its lifetime; changing chord moves gain, never
lifecycle. Voices are retuned only while silent, so a pitch change is inaudible, and common tones are
left completely untouched — not faded, not retuned, not restarted.

This did not become a musical envelope. The 14 ms ramps exist only to remove discontinuities; the
right hand remains the envelope.

*Verified:* the transition step now measures 1.00× the steady-state step.

### A3 — Timbre: unison, detune, stereo ✅

1. **Unison**: two or three oscillators per pitch, detuned a few cents apart.
2. **Stereo spread**: pan unison members across the field; the instrument becomes stereo.
3. **Sub-oscillator** an octave below the root for weight.
4. **Slow per-voice drift** — a very low-frequency, low-depth random modulation of detune, so a held
   chord breathes rather than sits.

Three oscillators per pitch, detuned ±7 cents, each feeding one of three shared stereo positions —
width comes from decorrelated signals sitting apart, not from panning a single source. A sine
sub-oscillator tracks the root an octave below for weight. Drift is one slow LFO per stereo position
(0.07/0.11/0.13 Hz, ±3.5 cents) fanned out to every voice at that position, so unison members wander
relative to *each other*; a single shared LFO would just be vibrato.

Twenty-four oscillators and three LFOs run continuously. That sounds like a lot and is not: they are
native nodes, and the render cost did not move measurably.

### A4 — Filter character ✅

1. **24 dB/oct** by cascading two biquads.
2. **Drive into the waveshaper** ahead of the filter, now that headroom exists to be driven.
3. **Key tracking** so high chords don't get dull and low ones don't get muddy.
4. **Resonance compensation** so a resonant sweep doesn't also become a volume sweep.

### A5 — Space ✅

1. **Reverb.** A convolver with a procedurally generated impulse response — exponentially decaying
   filtered noise — avoids shipping an IR asset, matching the offline-first approach already taken
   with the model files. An algorithmic reverb in an `AudioWorklet` is the alternative if the
   convolver proves too expensive or too static.
2. **Pre-delay and damping** so the tail sits behind the chord rather than smearing it.
3. **Subtle chorus** as an option, evaluated against A3's detuning — the two overlap, and doing both
   is usually too much.
4. Wet amount is fixed at a restrained 0.22. Mapping it to a gesture was left alone deliberately —
   there is no free axis, and inventing one would have cost more than the feature is worth.

The impulse response is generated at startup rather than shipped: exponentially decaying noise
through a one-pole lowpass, with the first five milliseconds faded in so the tail does not begin with
a click. An IR file would have been the largest asset in the project and is not distinguishable for a
pad. This matches the offline-first approach already taken with the model files.

### A6 — Measurement harness ✅ — `npm run audio`

Audio quality regresses invisibly, so the checks are automatic. Web Audio has no Node
implementation, so the harness drives headless Chrome and renders through `OfflineAudioContext`.
It calls the same `buildSynth` the live instrument uses, so it measures the real signal path rather
than a re-implementation of it — and it uses offline `suspend`/`resume` to change chord mid-render,
exactly as a player would.

It checks:

- **Peak, RMS and clipped-sample count** across every waveform and voicing at full volume.
- **Discontinuity**: the largest sample-to-sample step during a chord change, measured against the
  same statistic while a chord is merely held. An absolute threshold would be meaningless — a bright
  sawtooth has large steps by nature — so the check is a ratio against the instrument's own steady
  state.

It is deliberately *not* part of `npm run verify`: it needs a running dev server, and a check that
can fail for environmental reasons does not belong in the gate that must always be green.

Still open: a spectral check (FFT for aliasing reflections, DC offset, saturator harmonic profile).
Nothing currently suggests a problem there, and a check nobody needs is a check nobody maintains.

## What to listen for

A1 and A2 were corrective and are objectively verified. **A3 through A5 are matters of taste and were
decided by me, which makes them the ones worth arguing with.** Specifically:

- **Reverb at 0.22** — the most reversible decision here, and the easiest to overdo.
- **Detune at ±7 cents** — wider is lusher and vaguer; narrower is tighter and thinner.
- **Drive at 1.6** — subtle glue, not an effect. It will be most audible on square.
- **Sub at 0.22** — adds weight; on small speakers it may be inaudible, on good ones it may be too
  much.

Each is a single constant at the top of `synth.ts`.

The one constraint that survived all of it: **no per-note envelope**. The right hand is the envelope.
