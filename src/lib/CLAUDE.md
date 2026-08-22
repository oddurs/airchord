# src/lib — the instrument core

## Signal path

`features.ts` (landmarks → geometry) → `classifier.ts` (geometry → fingers) → `chords.ts` (fingers →
notes) → `synth.ts` (notes → sound). `engine.ts` wires them per frame; `overlay.ts` draws.

`features.ts` and everything downstream of it are pure. `vision.ts` is the only module that touches
MediaPipe.

## Classifier

Finger straightness comes from **3D joint angles**, which are invariant to hand position, size and
rotation. Do not go back to distance ratios — they failed twice for exactly that reason.

Current separation on the dataset: fingers curled 0.02–0.34 versus extended 0.88–0.97, a wide, clean
gap. The thumb is measured as **tip-to-index-knuckle distance**: folded 0.14–0.23, out 0.34–0.83.
Thumb *straightness* carries almost no information — a thumb is nearly always straight; what changes
is where it points.

The thumb margin is roughly 0.04 either side and is the narrowest signal in the instrument. More
capture sessions widen it. Per-player calibration is the real answer.

**A hand held upright does not read zero roll.** The dataset puts a neutral left hand at +0.05 to
+0.16 radians and a neutral right at −0.11 — anatomy, and opposite for the two hands. The major/minor
band therefore sits below zero rather than straddling it.

## Audio

Signal chain: unison oscillators → shared stereo buses → soft-clip drive → 24 dB/oct filter →
master gain → reverb send → DC block → limiter → out.

`buildSynth(ctx)` takes any `BaseAudioContext` so `npm run audio` can render and measure the real
graph offline rather than a stand-in. Keep that seam.

Gain staging is measured, not assumed. Worst-case peak must stay under 1.0 across every waveform and
voicing at full volume; the check enforces it.
