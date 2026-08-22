# Voices, and the first sixty seconds

Five plans came before this one — accuracy, latency, composure, songs, play-along — and every one of
them is about *correctness*. None was about how it feels to meet the thing. What was missing was not
a feature: it was that the instrument did not sound like anything in particular, and that nobody was
ever introduced to it.

## What was wrong

**"Warm / Bright / Retro" were `triangle / sawtooth / square` with nicer names.** The same graph
every time, one oscillator type swapped. Everything that actually gives an instrument a character —
unison spread, sub weight, saturation, where the filter sits, how wet it is, and above all what
happens when a chord is struck — was a constant tuned once and never varied. Delight in music
software is disproportionately tone: people forgive latency for something that sounds gorgeous and
forgive nothing for something that sounds like a synth demo.

**And the app assumed you already knew it.** Camera granted, hands up, and the only help was a
thirteen-row reference table — which is what you read *after* you understand. Meanwhile the two best
teaching things here, the ghost hand and waiting-for-the-player, were locked inside song mode.

## What was built

### Four voices

`timbre.ts` holds them as parameter sets. `synth.ts` no longer contains a single tone constant: it
builds the graph and asks the voice what to put in it. `applyTimbre()` is the one place a voice is
described, so there is no second place for it to drift out of date.

| | Character | The strike |
|---|---|---|
| Felt | Tight unison, heavy sub, dark filter | Deep and fast, recovering slowly |
| Glass | Wide detune, high filter, very wet | Barely ducks, swells back |
| Nylon | Saw, driven, dry | Deepest duck, longest ring-down, widest spread |
| Organ | Square, stacked sub, stable | No spread at all, back to full immediately |

The strike parameters do most of the work. Spread alone — `0` for the organ, `0.026` for the nylon —
is the difference between a keyboard and a hand crossing strings.

**Reverb length is shared.** Swapping a convolver's buffer mid-note clicks, and wet plus pre-delay
carry most of the difference between one room and another. Stated in the source so nobody tries.

### The check had to learn what a voice is

`npm run audio` renders all four now, and the articulation assertion had to change. It compared every
strike against one threshold — which quietly assumed every voice articulates the same way. Glass
declares a shallow duck *on purpose*, and it failed.

The fix is that each voice is judged against **what it declared**: a voice that says it ducks deep has
to deliver one, and every voice has to do something. The intent lives with the voice definitions; the
script only compares a number to the ceiling the voice set for itself.

| | dip | allowed |
|---|---|---|
| felt | 0.288 | 0.45 |
| glass | 0.534 | 0.70 |
| nylon | 0.284 | 0.45 |
| organ | 0.508 | 0.70 |

### And then it failed on CI, which was worth more than a green tick

Glass measured 0.72 against a 0.70 ceiling on the runner, having passed locally at 0.683. Chasing it
turned up something better than a flaky threshold: **the reverb impulse response was filled with
`Math.random()` on every build**, so every number in the audio report wobbled — by about 0.12 run to
run, which is larger than several of the things the report is supposed to be measuring. A check that
moves more than its subject is a check nobody can act on, and "measure, then change" stops being
something this project can actually do.

The impulse response and the drum noise buffer are now filled from a seeded generator. Noise is
noise; the instrument cannot tell, and the report is now identical run to run. Only `worst peak`
still moves, by about 0.009, because each drum hit starts at a random offset into the noise so
repeated hats do not phase into a tone — that one is deliberate, and it has 0.13 of headroom.

The failure also said something true about the sound. Glass ducked to 0.55, which the measurement
could not tell apart from not ducking at all — and neither could a listener. It ducks to 0.40 now.

Worst peak across all four with drums and a strum on the same beat: **0.847 of full scale, zero
clipped samples**, and no chord transition steps harder than simply holding one.

### The first sixty seconds

Five steps, one at a time, in the middle of the frame, with the pose drawn on the player's own hand
by the overlay that already existed: *raise one finger* · *now three* · *keep three and lean outward*
· *raise your right hand* · *lower both hands*. No chord names and nothing to read twice. The third
step is the point — the same fingers, a different chord, which is the idea this instrument is hardest
to guess.

Two decisions worth keeping:

- **It watches the HUD, not the engine's commit callback.** That callback has one slot and the
  practice session owns it. Reading `hud.numeral` instead means the tour can never take a song's
  grading away from it.
- **The HUD only updates when something changes**, so a pose held perfectly still stops producing
  renders and a naive "held for 400 ms" check would wait forever. A timer re-reads the current HUD
  through a ref; that is what notices the pose is *still* held.

### Three things are now remembered

Voice, key, and whether you have been shown around — `localStorage`, wrapped in try/catch because
private windows and disabled site data both throw, and a forgotten preference is not worth an
exception. Nothing else is stored, which keeps the promise the camera already makes.

## What is still missing

- **Nothing can be kept.** No recording, no export, no share. You play something lovely and it
  evaporates. `E7` in the instrument plan has the design; the artifact is obvious — twenty seconds of
  the energy wave with your chords over it.
- **No melody.** One chord at a time, ever, so the ceiling is "accompanist".
- **The layout still assumes a desktop**, when the ideal rig is a propped-up phone.
