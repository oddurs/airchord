# Gesture accuracy: making the classifier durable

Reported from play: closing both fists keeps a chord sounding, and accuracy is generally poor. The
wireframe overlay looks correct, which is diagnostically useful — MediaPipe's landmarks are fine.
**Everything wrong here is in our interpretation of them.**

## Root cause

Two independent defects, plus the methodological one that let both through.

### 1. The thumb feature is not pose-invariant

The thumb is judged by the distance from its tip to the pinky knuckle, scaled by palm size. That was
calibrated against hands where the thumb was *tucked across the palm*, measuring 0.09–0.41 against a
threshold of 0.70.

A closed fist is a different pose. The thumb lies across the **front of the folded fingers**, far
further from the pinky knuckle than when tucked flat against the palm — comfortably over the
threshold. The classifier reads "thumb extended".

### 2. There is no rejection class

```
const count = [thumb, index, middle, ring, pinky].filter(Boolean).length
return count >= 1 && count <= 5 ? count : null
```

Any single extended digit is degree I. A thumbs-up, a raised index finger and a fist-with-a-visible-
thumb are the same chord. Combined with defect 1, a closed fist plays the tonic — exactly the
reported symptom. On the right hand the same misread also flips the octave.

More broadly: **almost every possible hand pose maps onto some chord.** The instrument has no way to
conclude that you are not playing, so noise becomes music.

### 3. The one that matters — the sample could not contain the failure

Both thresholds were set from measurements, which felt rigorous and was not. All four reference
frames show a hand with an extended index finger. None is a fist, a flat palm, a relaxed hand, or a
hand at rest. The dataset had no negative cases at all, so no amount of care in reading it could have
caught this.

The first thumb feature was replaced because it failed on splayed hands. The second fails on fists.
A third clever feature chosen the same way would fail on something else. **The fix is coverage, not
cleverness.**

## The bar

Durability needs a number to hold to, not an impression:

- **≥ 99%** correct classification on deliberately held poses, across the full vocabulary.
- **Zero** chords triggered from rest poses — fist, flat palm, hands lowered, hands leaving frame.
- **≤ 1** spurious change per minute of continuous play.
- Every one of these measured automatically, on recorded real hands, on every change.

## What has landed

**The fist patch.** A thumb alone is no longer a chord — degrees I–V now require at least one
non-thumb finger. This removes the reported symptom in one rule and is covered by a test.

**Features rebuilt on joint angles.** Distance ratios are gone. Straightness now comes from the 3D
bend at each digit's outer joints, which is invariant to where the hand is, how big it is and how it
is rotated — none of which was true before, and each of which was a way to be wrong about a pose that
had never been measured.

**A rejection path.** Hands below MediaPipe's own confidence floor are ignored entirely; that score
was available all along and was being thrown away.

**A testable seam.** Hand geometry now lives in `features.ts` with no tracker, camera or browser
dependency, so recorded landmarks replay through exactly the code the instrument runs.

**The capture tool** (D1) and **the replay suite** (D4) are built. The suite skips with a clear
message until a dataset exists, and enforces the accuracy bar once one does.

### Still tuned on four frames

The new thresholds were set the same narrow way as the two that failed: measured across the four
reference frames, where curled fingers read 0.22–0.72 straightness and extended ones 0.87–0.99.
That is better evidence than intuition and still not enough evidence. Two things are different now —
the feature is principled rather than incidental, and **the harness that will catch the next failure
already exists and is waiting for data**.

One correction to the plan below: a flat open palm is *degree V*, not a rest pose. It cannot be part
of the rejection set. The rest poses are the fist, a relaxed hand, a lowered hand, and absence.

## Sprints

### D1 — Capture a real dataset ✅ built, awaiting data

Nothing else can be trusted until this exists.

1. **A capture mode in the app** — built. Run the dev server with `?capture`, hold each pose, and
   download `gestures.json`. It records **landmarks, not features**, so the features can be
   redesigned without recapturing.
2. **Cover the vocabulary and its negative space**: zero through five fingers, horns, ILY, thumb in
   and out, and — critically — **fist, flat palm, relaxed hand, hands lowered, hands leaving frame,
   hands holding something**.
3. **Cover the conditions**: both hands, near and far, rotated wrists, tilted, poor light, partial
   occlusion.
4. **Commit the dataset.** Landmarks are small and it becomes the project's ground truth.

*Done when:* every pose in the vocabulary and every rest pose has labelled recordings from more than
one session.

### D2 — Diagnose against the data

1. **Run the current classifier over the dataset** and produce a confusion matrix. Confirm the fist
   hypothesis rather than trusting the reasoning above.
2. **Plot feature separation per class.** The question for each feature is not "does it work" but
   "on which poses does it fail".
3. **Publish the baseline accuracy** so the improvement is measurable rather than felt.

### D3 — Redesign the features

1. **Normalise into a palm frame first.** Translate to the wrist, scale by palm size, rotate so the
   palm axis is canonical. Every feature then becomes independent of where the hand is, how big it
   is, and how it is rotated — which several current features are not.
2. **A better thumb.** Likely several features combined rather than one: curl angle at the thumb
   joints, tip distance to the index knuckle, and the thumb's angle away from the palm axis. Chosen
   from D2's separation data, not from intuition.
3. **An explicit rejection class.** A pose must earn a chord. Fist, flat palm and anything
   unrecognised return "not playing", and the instrument stays silent.
4. **A confidence score** alongside the classification, so a marginal pose can be refused rather than
   guessed at.

**Decision point: rules or a learned classifier?** A small model trained on D1's dataset would almost
certainly score higher. My recommendation is still hand-written rules validated against the dataset,
because **for an instrument, predictability beats accuracy**. A player learns and compensates for a
rule that is consistently wrong; a model that is unpredictably wrong 1% of the time cannot be learned
around. Revisit only if rules cannot reach the bar.

### D4 — A regression suite of real hands ✅ built, awaiting data

This is the sprint that makes it durable; the rest is a one-time fix without it.

1. **Replay the dataset through the classifier in tests** — built, in `classifier.test.ts`. Drop the
   captured file at `src/lib/fixtures/gestures.json` and it runs on every `npm test`.
2. **Assert per-class accuracy and zero false triggers on rest poses**, at the thresholds above.
3. **Fail the build on regression.** Accuracy has now degraded twice without any test noticing,
   because no test could see it.

### D5 — Calibration

Thresholds derived from one pair of hands are a prototype, not an instrument.

1. **A short calibration**: show the player a few poses, record them, fit their thresholds.
2. **Store locally**, re-runnable when something feels off.
3. **Feed the same recordings into the dataset**, so the ground truth grows with every player.

### D6 — Make misclassification visible

Right now a wrong chord is mysterious, which makes the instrument feel broken rather than imprecise.

1. **A per-finger readout** in the overlay: what the classifier believes each digit is doing.
2. **Show rejection explicitly** — "not playing" should look intentional, not like a failure.
3. **Use MediaPipe's own confidence scores.** They are available and currently ignored; a
   low-confidence hand should not drive the instrument at all.

## Sequence

**D1 → D2 → D3 → D4**, in that order, with no shortcuts. D1 and D2 are unglamorous and are the whole
point: the last two attempts at this problem both jumped straight to a clever feature, and both
worked on the frames available and failed on the ones that were not.

**D4 is the durability requirement.** Without a regression suite over real hands, the classifier will
drift again and nothing will notice until someone plays it.

D5 and D6 follow. D6 is worth pulling forward if debugging by ear becomes tiresome — seeing what the
classifier thinks makes every later sprint faster.

## What is needed next

Two minutes of your hands. Run `npm run dev`, open `https://localhost:9191/?capture`, and record each
pose — including the ones that should make no sound. Save the download to
`src/lib/fixtures/gestures.json`.

From there D2 and D3 become data work rather than guesswork: a confusion matrix over real poses, then
thresholds and a thumb rule chosen from measured separation instead of from four frames.
