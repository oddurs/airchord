# Sprint log

Where the build stands against [the spec](./01-original-spec.md). S1–S4 are complete; S5 is
uncommitted backlog.

## Status

Legend: ✅ matches spec · 🔵 deliberate divergence · ⚪ backlog

| Area | Item | | Note |
|---|---|---|---|
| Gesture | Degrees I–V by finger count | ✅ | |
| Gesture | VI / VII horn patterns | ✅ | Pattern-matched before counting |
| Gesture | Major/minor from hand lean | 🔵 | Roll angle + hysteresis; same sign, steadier at the boundary |
| Gesture | Finger-extension test | 🔵 | Rotation-invariant — see spec §7 |
| Gesture | Knuckle-span dead-zone tilt | ✅ | Overshoot past the middle/ring knuckle span ÷ 0.12 |
| Gesture | Volume from wrist height, full frame | ✅ | |
| Gesture | Stabilisers | ✅ | 100 ms chord hold, 50 ms expression grace, both time-based |
| Music | Degree VII = −1 semitone | ✅ | Covered by a test, since it looks like a bug |
| Music | Register drop for F#/G/G# | ✅ | Baked into the key table as data |
| Music | Four-note spread voicings | ✅ | All eight cases |
| Sound | Continuous oscillators, gain as envelope | ✅ | No ADSR anywhere — this is the feel |
| Sound | Bipolar filter sweep around 1200 Hz | ✅ | 250 Hz / Q 2.2 inward, 5 kHz / Q 5.2 outward |
| Sound | WaveShaper stage | ✅ | Present, 4× oversample, transparent curve |
| Sound | 30 ms gain / 40 ms filter smoothing | ✅ | `setTargetAtTime` |
| Visual | Mirrored cover-cropped video, landmark dots | ✅ | |
| Visual | Energy wave | ✅ | Degree hue, quality brightness, voicing line count, volume thickness, tilt jitter |
| Visual | Chord / quality / filter / volume HUD | ✅ | Filter now signed, since the sweep is bipolar |
| Visual | Idle and no-hands states | ✅ | |
| Shell | Credit to the original creator in-app | ✅ | About dialog; licence obligation |
| Shell | Camera error states | ✅ | Permission, missing, in-use, and insecure-context each answered |
| Shell | Phone layout, keyboard access | ✅ | |
| Infra | HTTPS + LAN + self-hosted model | ✅ | HTTP on the same port redirects rather than erroring |
| Infra | Handedness, lean threshold | ✅ | Verified against real footage — see S6 |
| Design | Single-family typographic system | ✅ | See S7 |
| Gesture | Hysteresis + smoothing on every decision | ✅ | See S8 |
| — | Drive curve on the WaveShaper | ⚪ | Stage is wired; needs a free axis |
| — | Latch / sustain without holding the pose | ⚪ | |
| — | Progression recorder | ⚪ | |

## What changed, sprint by sprint

**S1 — sound engine.** Tone.js is gone. The spec's architecture — four oscillators that simply run,
with master gain as the only amplitude control — needs none of what Tone provides, and the
dependency was costing ~200 kB to wrap four `OscillatorNode`s. Raw Web Audio is both smaller and a
closer match to the thing being modelled. Root position is now a spread voicing (drops the close
third, doubles the octave), which is most of the difference in fullness.

**S2 — gesture measurement.** Tilt became the knuckle-span dead zone, which gives a rest position of
exactly zero with no threshold to tune. Stabilisers became time-based: a 100 ms hold before a chord
commits, and a 50 ms grace window so a dropped tracking frame doesn't stutter the sound. The old
3-frame rule meant something different on a 120 Hz display than on a 30 fps webcam.

**S3 — visuals.** The energy wave now maps all five of its channels to player state.

**S4 — shipping.** About dialog with attribution, README including the iOS certificate-trust step,
specific camera error messages, an on-screen statement that video never leaves the device, keyboard
focus states, and narrow-width layout.

## Two divergences, kept on purpose

Both are marked 🔵 above and commented in the source so they don't get "fixed" back:

1. **Finger extension** is measured as distance from the wrist rather than tip-above-knuckle. The
   original's test assumes an upright hand and misreads fingers as the wrist rotates — which is
   exactly when you are also changing chord quality, so the two failures compound.
2. **Major/minor has hysteresis.** The original switches on a hard threshold; a hand held near
   vertical chatters between the two. The commit boundary and the release boundary differ here.

## S6 — bug fixes, driven by real footage

The three "can only be settled in front of a camera" unknowns were settled without a camera, by
driving the app in headless Chrome with `--use-file-for-fake-video-capture` and feeding it frames
built from stills of the source performance. Two of the three were wrong.

The rig matters as much as the fixes. Frames are cropped from the stills, **horizontally flipped**,
and letterboxed to 1280×720. The flip is the part that is easy to get wrong: the stills show the
app's own mirrored display, and a real webcam frame is not mirrored — feeding them unflipped would
have "confirmed" exactly the wrong handedness.

| Bug | Diagnosis | Fix |
|---|---|---|
| Hands swapped | MediaPipe's docs say a raw frame needs its handedness swapped. It does not — confirmed both by driving real frames and by the original, which uses the reported label as-is. | `SWAP_HANDEDNESS = false` |
| Minor chords unreachable | The lean threshold was set at −0.3 rad by guesswork. Measured footage puts minors at −0.12 to −0.14, so the band never opened. | Band straddles zero: −0.07 / +0.03 |
| Console 404 | No icon declared, so browsers probe `/favicon.ico`. | `app/icon.svg` |
| `localhost:9191` refused | Browsers default to `http://`, and a TLS-only socket answers that with a protocol error. | One port, both protocols: peek the first byte (`0x16` = TLS) and route |

Two things that looked like bugs and were not: hands going undetected on two frames (a fixed crop
was clipping them — a rig fault), and near-zero volume (the crop put the wrists at the bottom of
frame, and volume is wrist height).

**Result:** all four frames of the source progression now reproduce exactly, `(-8ve)` tags included.

| Frame | Expected | Produced |
|---|---|---|
| 1 | E (I) Major | E (I) Major (-8ve) |
| 2 | G# (III) Major | G# (III) Major (-8ve) |
| 3 | A (IV) Major | A (IV) Major (-8ve) |
| 4 | Am (iv) Minor | Am (iv) Minor (-8ve) |

The measured roll values are now unit tests. The threshold bug was invisible to every check that
existed — it typechecked, built and played; it just could not reach half the chords — so the values
that exposed it are pinned in `chords.test.ts` rather than left in a commit message.

`Engine` exposes the raw per-hand features on `window.__airchord` in development, which is how the
measurements were taken. It is compiled out of production builds.

## Still unverified

**Tilt sign.** Whether rolling the right wrist inward reads as negative rests on a coordinate
derivation done on paper; the source stills don't exercise the filter enough to settle it.
`readTilt` negates in one place and says so.

**Feel.** The 100 ms chord hold and the filter ranges are the spec's numbers, but they were tuned by
someone playing the instrument, not by matching stills.

## S7 — typographic identity

The look was inherited from the original: amber, bordered boxes, monospace. Replaced with something
minimal and this project's own.

- **One family.** Inter, self-hosted via `next/font` — no runtime request, no layout shift.
  Hierarchy comes from size, weight, tracking and opacity rather than a second voice. Display type
  is tracked tight (−0.045em), small type tracked open (+0.18em); that inversion is what stops a
  single family reading as one flat tone.
- **Monochrome chrome.** White at four opacity steps and nothing else. The energy wave is the only
  element allowed colour, so hue always means something musical.
- **Boxes removed.** Borderless selects, a rule instead of a segmented meter, the guide as
  typographic pairs on a baseline grid rather than a panel.
- **A real chord lockup** instead of the string `"E (I)"`: the name large, the numeral raised to cap
  height as an annotation, the quality below in tracked caps. `Hud` carries the parts as separate
  fields so the layout can set each as type.
- Live numerals are tabular, so a changing filter reading doesn't reflow.

Two layout faults were only visible once screenshotted, and both were fixed by looking rather than
reasoning: the energy wave cut straight through the chord lockup (the wave now owns the bottom band
alone), and the guide panel sat on top of the chord (moved to the right column, opposite the
controls).

## S8 — consistency

Reported from real play: holding five fingers on both hands jerked between V and iv, and the octave
toggled. Three symptoms, one cause — **every binary decision was re-made from scratch each frame
from a noisy measurement against a single threshold**, so a hand held near any threshold produced a
new answer, and every new answer is an audible chord change.

Three fixes, in order of how much they mattered:

1. **The thumb measurement was wrong.** Comparing the thumb's tip and joint distances from the palm
   gives a ratio near 1.0 on a splayed hand — right on the noise floor, which is precisely why
   five-finger poses were the worst case. Replaced with spread from the pinky knuckle scaled by palm
   size, which separates tucked (0.09–0.41) from extended (0.85–0.90) with a wide gap.
2. **Thresholds are now hysteresis bands, set from measured data.** Every finger decision goes
   through a `Latch` with separate make and break points sitting in the middle of the measured gap.
   The provisional values were badly wrong — the finger threshold sat *above* real extended values
   (1.30 vs a 1.26 minimum) and the thumb threshold above everything.
3. **Continuous axes are smoothed.** Roll, tilt and height each run through an exponential moving
   average before use, so a single bad frame can't swing a decision.

| Signal | Curled / tucked | Extended | Band |
|---|---|---|---|
| Fingers | 0.62 – 0.80 | 1.26 – 1.42 | 0.95 / 1.10 |
| Thumb | 0.09 – 0.41 | 0.85 – 0.90 | 0.58 / 0.70 |

The `Latch` and `Smoothed` primitives are unit-tested, including a replay of the jitter itself: a
sequence hovering at the old threshold must produce one steady answer. All four reference frames
still resolve correctly after the measurement was replaced.

## S5 — backlog, not committed

Beyond the table above: **unverified** — several sites (`gesturesynth.art`, `.net`, `.pro`, `.fun`)
describe a "theremin mode" alongside gesture mode. These appear to be SEO clones rather than the
creator's own; his repo and the deployed build have no such mode. Treat as a *possible idea*, not as
missing spec.
