# From demo to instrument: sprint plan and log

The instrument was correct, stable and good-sounding, but not yet *playable* — you could not play it
for an hour, in time, or get what you played out of the browser.

**Phase 1 (E1, E2) is complete.** Phases 2 and 3 remain planned.

## The pivotal question, first

**Is this a pad instrument or a rhythmic one?**

Everything below branches on the answer, so it should be answered deliberately rather than by
accumulation.

- **A pad instrument** sustains. Chords bloom and fade, timing is loose by design, and the current
  100 ms commit is correct. This is what exists today, and it is coherent.
- **A rhythmic instrument** articulates. Chords land on beats, timing is tight, and 100 ms of
  deliberate lag is fatal.

Doing both is possible — one mode switch — but it is not free, and pretending the tension doesn't
exist is how instruments end up mediocre at both. My recommendation: **commit to the pad identity as
the default and earn the rhythmic mode**, because the sustained, breathing character is genuinely
what this instrument is good at, and articulation can be added as a deliberate second voice rather
than a compromise applied to the first.

## The latency budget

Measured on this machine, not estimated:

Now measured end to end and reported live in the dev diagnostics (`window.__airchord.timing`):

| Term | Measured | Notes |
|---|---|---|
| Camera cadence | **33 ms** (30 fps) | The instrument now asks for 60; the test rig's synthetic camera is fixed at 30, so the improvement is real hardware's to grant |
| Hand inference | **11.1 ms** | Comfortably small |
| **Chord commit** | **100 ms** | **56% of the total, and entirely ours** |
| Audio output | **32.3 ms** | Buffer is 5.3 ms; the rest is the device |
| **Total** | **~176 ms** | |

The number that matters: **the deliberate wait is the largest single term**, bigger than the camera,
the model and the audio device combined. It is also the one constant nobody had revisited since the
tracking got clean.

Two things this makes obvious. The audio path — the part that felt most technical — is already the
smallest term and needs no further work. And **the largest term we control is a constant we chose**.
That constant was set for pads and never revisited once the measurement quality improved.

## Phase 1 — Make it responsive ✅

### E1 — Timing ✅

1. **Instrument the loop.** Per-frame inference time, frame interval, and gesture-to-sound latency,
   behind the existing dev diagnostics. Everything else in this phase is guesswork without it.
2. **Ask the camera for 60 fps** (`frameRate: { ideal: 60 }`) and confirm it is granted. Halving the
   frame interval is the single cheapest latency win available.
3. **Split the commit.** Today one 100 ms hold gates everything. A chord *change* and a chord
   *release* do not need the same confidence, and neither does a voicing tweak on a chord already
   sounding. Voicing and octave changes on a held chord can commit almost immediately, because a
   wrong voicing is a colour error rather than a wrong note.
4. **Onset commit for the rhythmic mode**: sound on the first frame a new gesture is *plausible* and
   correct it if the following frames disagree, rather than waiting for certainty. This trades rare
   audible corrections for a large latency reduction, and is only defensible now that the
   measurement is clean.

**Done.** The loop is instrumented, the camera is asked for 60 fps, and the commit is split: chord
identity still waits 100 ms, while voicing and octave commit in 40 ms. A wrong voicing on a chord
already sounding is a colour error, not a wrong note, so it does not deserve the same caution — and
the right hand now responds noticeably faster than the left.

Onset-commit (sound on the first plausible frame, correct if later frames disagree) is deliberately
**not** built. It belongs to the rhythmic mode, and the pad identity was the chosen default.

### E2 — Playability over time ✅

The fatigue problem was the clearest evidence this was not yet an instrument: you could not hold your
arms up for a whole song.

1. **Latch.** A gesture that holds the current chord so the hands can rest, and releases it
   deliberately. This single feature changes what is playable more than anything else in this plan.
2. **A real rest position.** Hands lowered should mean silence, unambiguously, with no chance of a
   stray chord on the way down or up.
3. **Graceful re-entry.** Hands leaving and returning to frame should resume, not glitch. The 50 ms
   expression grace window is a start; tracking loss during a held chord needs its own answer.
4. **One-handed play.** Left hand alone should be a complete instrument with sensible defaults, so
   the right hand can rest, hold a phone, or hold a drink.

**Done.**

- **The pedal is the spacebar.** Every keyboard instrument has a sustain pedal, and the gesture axes
  were all allocated — so rather than inventing a pose to memorise, the instrument borrowed the
  metaphor that already exists. There is a `Hold` control for touch, and the chord shows `Held`.
- **A latch freezes identity only.** Which chord is sounding is held; voicing, filter and volume stay
  live. A held chord can still be shaped, which is the difference between a hold and a recording.
- **Rest and absence are different things.** A lowered hand is an instruction and silences the
  instrument immediately; a hand that vanishes has been dropped by the tracker and is carried through
  a 220 ms grace window. Conflating the two is why dropouts used to sound like mistakes.
- **One-handed play has dynamics.** With the right hand away, the left takes over volume rather than
  falling back to a constant — so the instrument stays expressive with one hand resting.

Two new primitives carry this, both unit-tested: `Committer` (commit only after a gesture is held,
with its own latency) and `Grace` (hold a value through a brief absence). They replaced ad-hoc
timing state that had accumulated in the engine.

## Phase 2 — Make it expressive

### E3 — Articulation

Turning a drone into playing. This is where the rhythmic mode earns its place.

1. **Strum.** Voicing notes offset in time by hand movement, rather than all landing together. The
   most characteristically *instrumental* thing on this list.
2. **Attack gesture** to re-trigger a chord already sounding, so a chord can be played twice.
3. **Damp/mute** — a palm gesture that stops immediately, with a shorter release than the musical one.
4. **Velocity from gesture speed.** A fast raise should hit harder than a slow one; currently the
   hand's *position* is everything and its *motion* is unused.

### E5 — Calibration and fit

Every threshold in the instrument was tuned against one person's hands in one room. That is fine for
a prototype and disqualifying for an instrument.

1. **A calibration pass**: neutral pose, full roll range, reach for volume, hand size. Thirty seconds,
   once, stored locally.
2. **Derive thresholds from it** rather than from constants — the lean band especially, which is
   currently a ±0.05 radian guess around one player's wrist.
3. **Left-handed mirror mode.** The instrument currently assumes chord duty belongs to the left hand.
4. **Camera and audio device selection**, and guidance on framing and distance.

*Done when:* someone who is not you can pick it up and play a progression without adjusting code.

### E6 — Musical range

1. **Modes and scales** beyond major.
2. **Extended voicings** — sus, add9, 6ths. The right hand's four finger states are fully allocated;
   this needs a modifier rather than a new axis.
3. **Live key change** without going to a menu, so a performance can modulate.

## Phase 3 — Make it leave the browser

### E4 — MIDI out

The highest-leverage single feature here: it turns the instrument into a controller for *any* sound,
and makes it recordable in any DAW.

- Notes for the chord, continuous controllers for filter and volume.
- **Chrome and Firefox only** — Safari has declined Web MIDI for years over fingerprinting, and iOS
  will not have it. This needs honest degradation, not a broken menu item.
- Requires a permission prompt and a secure context; the HTTPS server already satisfies the latter.
- Sysex is not needed, which avoids the more invasive permission.

### E7 — Capture

1. **Record the gesture stream**, not the audio. It is tiny, it is replayable, and it can be
   re-rendered.
2. **Export audio by offline render** of that stream — faster than real time and at perfect quality,
   reusing exactly the `OfflineAudioContext` path the audio checks already use.
3. **Export MIDI file** from the same stream.

Recording gestures rather than sound is the choice that makes the other two nearly free.

### E8 — Learning

An instrument rewards practice; this one currently has a skill ceiling of about ten minutes.

1. **Guide mode**: show a target chord, detect whether it was hit, and how cleanly.
2. **Progression follow-along** so a song can be practised.
3. **Honest feedback** on what the tracker actually saw, so a player can learn *why* a chord did not
   trigger instead of guessing.

## Sequence

**E1 → E2** first, together: they are the difference between a demo and something playable, and
neither is a matter of taste. **E3 and E5** next — E5 is unglamorous and is what lets anyone else
play it. **E4** whenever it is wanted; it is self-contained and does not depend on the rest.
**E6, E7, E8** last, and genuinely optional.

If only one sprint ever happens, it should be **E2** — the latch and a real rest position. Not being
able to put your arms down is the most instrument-disqualifying thing about the current build, and it
is also among the cheapest to fix.
