# The original, deconstructed

Sources, in ascending order of authority: four screen recordings of a performance; the deployed
build at `gesture-synth-weld.vercel.app` (HTML, in-app guide, JS bundle); and the public source at
`github.com/ericwei97-cloud/gesture-synth`, read to extract parameter values.

## 1. The shape of the thing

One page, no backend. A webcam feed is drawn mirrored to a canvas; MediaPipe's Hand Landmarker runs
on each frame in WebAssembly; the 21 landmarks per hand are reduced to a handful of scalars, and
those scalars are wired straight to a Web Audio graph. There is no gesture *classifier* — no ML
beyond the hand tracker. Every musical decision is a lookup table over finger counts.

```
webcam ─► HandLandmarker (wasm) ─► 21 landmarks × 2 hands
                                        │
              ┌─────────────────────────┴─────────────────────────┐
         left hand                                           right hand
   finger set → scale degree                       finger count → voicing
   knuckle lean → major/minor                      thumb → octave
                                                   wrist offset → filter
                                                   height → volume
              └─────────────────────────┬─────────────────────────┘
                                        ▼
                    oscillators → waveshaper → lowpass → gain → out
```

## 2. Gesture → chord

**Left hand picks the chord.**

| Fingers | Degree |
|---|---|
| 1 – 5 extended (any set, counted) | I, II, III, IV, V |
| index + pinky, no thumb | VI |
| index + pinky + thumb | VII |
| nothing valid | silence |

Note the ordering: VI and VII are matched as *patterns* before the count is taken, because counting
alone cannot tell devil-horns from a peace sign.

**Quality is the hand's lean, and it overrides the key.** The original does not measure an angle. It
compares the x of the middle knuckle against the x of the wrist: knuckles to one side is major,
knuckles to the other is minor. A hard threshold at zero, no dead zone.

That override is the whole musical trick. Degree III in a major key is diatonically *minor*; leaning
the hand the other way forces III **major**. The Radiohead progression in the source clips —
`E(I) → G#(III) → A(IV) → Am(iv)` in E — is exactly two borrowed chords produced by wrist rotation.
The IV and iv are the same four fingers; only the lean changes.

**Scale degrees, in semitones from the tonic:**

| Degree | I | II | III | IV | V | VI | VII |
|---|---|---|---|---|---|---|---|
| Semitones | 0 | 2 | 4 | 5 | 7 | 9 | **−1** |

VII is **−1**, not +11: it sounds the subtonic *below* the tonic rather than the leading tone above.
Whether that is deliberate voicing or a happy accident, it is what the instrument does, and copying
+11 instead makes VII sound wrong in a way that is hard to trace later.

There is also a register fix: in the keys F#/Gb, G and G#/Ab the tonic is halved, dropping the whole
instrument an octave so the high keys don't get shrill.

## 3. Gesture → sound

**Right hand shapes it.**

| Input | Effect |
|---|---|
| 1–4 fingers | voicing (below) |
| thumb extended | drops the whole chord an octave |
| wrist offset from knuckles | filter sweep |
| hand height | volume, across the full frame (wrist y, 0.05–0.95) |

The in-app guide phrases the octave as "thumb in → higher", which is the same rule read the other
way round: an *extended* thumb halves every frequency. Worth stating unambiguously, because the
guide's phrasing and the on-screen `(-8ve)` tag can be read as contradicting each other.

**Voicings are always four notes** — four oscillators, always running. Crucially the root-position
voicing is *spread*, not a close triad: it omits the close third and doubles at the octave. This is
most of why the original sounds full rather than thin.

| Fingers | Major mode | Minor mode |
|---|---|---|
| 1 | root, 5th, octave, octave 3rd | root, 5th, octave, octave ♭3rd |
| 2 | 3rd, 5th, octave, octave 3rd | ♭3rd, 5th, octave, octave ♭3rd |
| 3 | root, 3rd, 5th, **maj 7th** | root, ♭3rd, 5th, **♭7th** |
| 4 | root, 3rd, 5th, **♭7th** (dominant) | root, ♭3rd, **♭5th**, **6th** (diminished 7th) |

**The filter sweep is bipolar**, which the in-app guide does not say. Centre is 1200 Hz, Q 0.7:

| Tilt | Cutoff | Q | Character |
|---|---|---|---|
| inward, full | 1200 → 250 Hz | 0.7 → 2.2 | muffled, woody |
| centred | 1200 Hz | 0.7 | neutral |
| outward, full | 1200 → 5000 Hz | 0.7 → 5.2 | bright, resonant squelch |

A `WaveShaper` sits before the filter, oversampled 4×, but ships with a null curve — the distortion
stage is wired up and currently inert. The HUD element is still named for it.

**There is no note envelope.** The oscillators start when the frequency set changes and simply run.
Loudness is the master gain, and the master gain is your right hand's height. The right hand *is*
the envelope — that is why the instrument feels like a bowed pad rather than a keyboard, and it is
the single most important thing to get right.

Smoothing is done with `setTargetAtTime`: 30 ms on gain, 40 ms on the filter. Enough to kill clicks,
fast enough to feel connected to the hand.

## 4. The tilt measurement

Worth its own section, because it is the cleverest part and the least obvious.

Tilt is not an angle. Take the x-span between the middle and ring knuckles; ask where the wrist sits
relative to that span. Inside it → **exactly zero**, a natural dead zone. Outside it → the overshoot
divided by 0.12, clamped to ±1, and negated for the right hand.

The dead zone is free: a hand held normally reads as no tilt, with no threshold to tune, and the
control only engages when you deliberately roll the wrist.

## 5. Stabilisation

Two independent stabilisers, on different clocks — musical state should be *certain*, expression
should be *immediate*:

- **Chord state** must hold ~100 ms before it commits. This is what stops the synth machine-gunning
  through wrong chords while your fingers are in transit.
- **Expression** (volume, filter) uses a ~50 ms null window and otherwise tracks live.

## 6. UI

Mirrored, dimmed video; white landmark dots over the hands; chord name and roman numeral in large
amber serif at bottom-left with the quality beneath it; a signed filter percentage bottom-right; an
8-segment volume ladder on the right edge; key and waveform selects and a gesture guide top-left; a
help modal with credits; and a click-to-start overlay, since audio and camera both need a user
gesture.

**The energy wave is fully mapped** — every channel of it reports something the player is doing,
and none of it is decorative:

| Channel | Driven by |
|---|---|
| Hue | Scale degree — seven fixed colours, tonic amber through VII cyan |
| Brightness | Major at full alpha, minor damped to 0.7, no chord to 0.3 grey |
| Number of stacked lines | Right-hand finger count (0 draws nothing at all) |
| Line thickness | Volume, hairline to ~9px |
| Jitter amplitude and rate | Tilt, remapped from ±1 to a 0..1 "chaos" scale |

The zero-finger case matters: a right hand with nothing extended still sounds a chord in default
voicing, but the wave disappears. It is a real state, not a fallback.

Three waveforms only: triangle (warm), sawtooth (bright), square (retro).

## 7. Where this implementation deliberately differs

Not everything above is worth copying exactly.

| Original | Here | Why |
|---|---|---|
| Finger extended if tip is above the PIP joint | Tip is farther from the wrist than the PIP joint | The original's test assumes an upright hand and misreads fingers as the wrist rotates — which is exactly when you are also changing chord quality |
| Thumb by tip-vs-joint x, per handedness | Distance from the pinky knuckle | Distinguishes "tucked across the palm" from "sticking out" at any rotation |
| Frame-rate-dependent stabiliser | Currently frame-count | Should become time-based; see sprint S2 |

Everything else in this document is behaviour to match, not to improve on.
