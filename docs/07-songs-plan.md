# Songs and tutorials: playing a whole song

This unpacks **E8** from [the instrument plan](./05-instrument-plan.md), which was one line — "guide
mode, follow-along, honest feedback" — into something buildable. The first song is **Creep**.

The instrument can already play a song. What it cannot do is *teach* you one: there is nothing to
play along to, nothing telling you what comes next, and no way to find out whether the chord that
came out late was your hand or the pipeline.

**Status: L1–L7 are built.** The clock, the drum track, the chord lane, the ghost hands, the grading,
both modes and the two-hand diagrams are in the app. What was learned building them, and what is still unproven, is at the
end of this document.

## Why Creep is the right first song

Not sentiment — it is the easiest four bars in pop that still use the interesting half of this
instrument.

- **One loop, whole song.** `I – III – IV – iv`, one chord per bar, and it never changes: verse,
  chorus and bridge are the same four bars. Learn the loop and you have learned the song.
- **The degrees land on easy poses.** One finger, three fingers, four fingers, four fingers again.
- **Exactly one hard move, and it is last.** Bar 3 → bar 4 changes *nothing* about the fingers; only
  the wrist leans over. That is the whole minor/major axis taught in one transition, and it arrives
  at the end of the loop where the next bar is a full bar away.
- **It borrows.** Degree III is diatonically minor and Creep wants it major; degree IV is
  diatonically major and Creep wants it minor. Both are a wrist flick. The instrument's most
  unusual design decision — that quality is a continuous gesture and not a mode — is the *reason*
  this song is playable at all.
- **It is already verified.** The four reference frames pinned in S6 and in `chords.test.ts` — E,
  G#, A, Am — are this progression. The source footage was someone playing Creep. The notes are
  proven correct; only the teaching layer is missing.

Canonical key is **G**; the reference frames are in **E**. Songs are therefore stored as *degrees*,
never as note names, and the existing key selector transposes them for free.

| Bar | In G | In E | Left hand | Lean | Right hand |
|---|---|---|---|---|---|
| 1 | G | E | index | inward → major | one finger, thumb tucked |
| 2 | B | G# | index + middle + ring | inward → **major** (borrowed) | unchanged |
| 3 | C | A | index + middle + ring + pinky | inward → major | unchanged |
| 4 | Cm | Am | **unchanged** | outward → **minor** (borrowed) | unchanged |

The right hand does nothing at all for a first pass. Once the left hand is automatic it has the
whole song free: raise it through bar 3 for the lift, roll it outward for the choruses.

## What "aiding you" actually means

Four jobs, routinely conflated into one "tutorial mode" and each needing different machinery:

1. **A clock**, so you are playing music rather than reciting chords. This is the drum track.
2. **Anticipation** — what is next, early enough to move. This is the chord lane.
3. **The pose, not the name.** "Cm" is useless mid-song; a hand showing four fingers and a lean is
   not. This is the ghost hand.
4. **Honest feedback.** Whether you hit it, and when you didn't, *what the tracker actually saw*.

3 is the one most guide modes skip and the one that matters most here, because the mapping from
chord name to hand pose is the entire skill being learned.

## The lead-time budget

Same discipline as [the latency budget](./05-instrument-plan.md#the-latency-budget), because it is
the same problem wearing a different hat.

| Term | Cost |
|---|---|
| Frame interval | 8–17 ms |
| Hand inference | 10–25 ms |
| `CHORD_HOLD_MS` commit | 100 ms |
| Audio output | 10–25 ms |
| **Pose to sound** | **≈ 130–170 ms** |

A beat at 92 BPM is 652 ms. So the hand must be in position roughly **a quarter of a beat before the
downbeat** for the chord to land on it. Three consequences, and they are design decisions rather
than details:

- **The cue leads by one full beat.** Enough to move, not so much that you are tracking two bars at
  once.
- **Scoring reads the gesture, not the sound.** Grade the moment the `Committer` accepts the
  identity, minus the measured pipeline; grading audible onset would report every player as
  permanently late, and they would try to fix a lag that is not theirs.
- **The lead time is shown, not hidden.** "Move on the *and* of 4" is a teachable instruction. A
  mysterious 150 ms is not.

The latency is not a bug these sprints fix. It is a fact they teach around.

## What a song is allowed to contain

The vocabulary is seven degrees, major or minor by lean, four voicings, and an octave switch. No sus
chords, no slash chords, no roots outside the key's seven. Creep fits because both of its "outside"
chords are quality flips of degrees that are already there.

**Reject unplayable songs at authoring time rather than approximating them.** A song taught with the
wrong chord, confidently, is worse than a song that is absent — the player will trust the app over
their ear, which is the one thing a tutorial must never spend. A test asserts that every committed
song resolves through `buildChord` to the chords its own metadata claims.

## Attribution, honestly

Chord progressions are not the copyrightable part of a song; lyrics, melody and recordings are. What
ships is degrees, tempo, title, artist and a link — no lyrics, no melody line, no audio. The drum
pattern is a generic 4/4 rock beat, not a transcription of Phil Selway. This is the same care the
project already takes with [the original's licence](./README.md#attribution-and-licence), and it
costs nothing to get right at the start.

## Sprints

### L1 — Songs as data, and a transport ✅

The clock, before anything visible.

1. **A `Song` type and `src/lib/songs.ts`.** Bars of `{ degree, major, voicing?, octaveDown? }`,
   plus `bpm`, `beatsPerBar`, `countInBars`, canonical key, and credit. Chord *names* are derived
   through `buildChord` for the chosen key, never stored — that is what makes transposition free.
2. **A transport on the audio clock.** The standard lookahead scheduler: a 25 ms timer that
   schedules every event falling inside the next 100 ms at an exact `currentTime` offset. `rAF` is
   for drawing and drifts audibly; it must not be allowed near the beat.
3. **It shares the synth's context.** Build it alongside `buildSynth(ctx)` so the offline render
   path measures the transport too, exactly as the audio checks already do.
4. **Count-in, loop, and a tempo scale** (50–100%) that is a property of playback, not of the song.

*Done when:* a headless offline render places 32 bars of beat events on the sample they belong on,
and slowing the tempo moves them without changing their order.

### L2 — The drum track ✅

1. **A synthesised kit.** Kick: sine, 110 → 45 Hz pitch envelope, ~120 ms. Snare: filtered noise
   burst plus a short tuned body. Hat: high-passed noise, ~40 ms. No samples — the same reasoning
   that removed Tone.js in S1 applies to a 2 MB drum library.
2. **Patterns as data**, per song: a rock beat (kick 1 and 3, snare 2 and 4, eighths on the hat), a
   click, and off. Creep gets the rock beat after a count-in bar.
3. **Its own send into the master limiter**, bypassing the chord reverb. Drums through a 2.4 s
   convolution is mud, and the limiter is the only thing protecting the mix.
4. **Extend `npm run audio`.** The loudest case is now drums plus the densest voicing plus full
   volume; assert it stays under full scale. The measurement harness exists precisely so this is
   checked rather than assumed.

*Done when:* `npm run audio` reports the drum-and-chord worst case under full scale, and the beat is
sample-accurate in an offline render.

### L3 — The chord lane ✅

The first thing you actually see.

1. **Current bar plus the next three**, moving right to left, chord name and numeral set in the S7
   type system — the numeral raised as an annotation, the same lockup the HUD already uses.
2. **Beat pips**, so the bar has a visible pulse and the count-in is legible.
3. **A lead-in cue one beat before each change**, derived from the measured pipeline in the
   diagnostics, not from a constant someone liked the look of.
4. **It owns a band of the screen.** The energy wave owns the bottom, the chord lockup the centre;
   the lane goes above the wave or it repeats the S7 collision.

*Done when:* screenshots at three positions in the loop read correctly, and the cue timing is a
function of the latency budget rather than a literal.

### L4 — The ghost hand ✅

The sprint that makes this a tutorial rather than a chord chart.

1. **Pose templates as captured data.** One recorded landmark frame per pose in the vocabulary,
   taken with the capture tool from [D1](./06-accuracy-plan.md#d1--capture-a-real-dataset) and
   committed as fixtures. Hand-authoring 21 coordinates by eye produces a hand no one recognises.
2. **Registered to your hand.** Translate to your wrist, scale by your palm size, rotate to your
   palm axis, and draw it through the existing skeleton renderer in `overlay.ts` at low opacity.
   The target pose appears *where your hand is*, so matching it needs no eye movement and no mental
   rotation. Reuses `drawHands`; the registration is the only new maths.
3. **A lean arc at the wrist** showing which way to roll, with a needle for your actual smoothed
   roll against the hysteresis band. The major/minor decision is a zero crossing worth about 0.1
   radians — invisible unless it is drawn.
4. ~~**The right hand gets a ghost too**~~ — cut. Every song here is accompaniment in root position,
   so it would have been a renderer with nothing to render.

*Done when:* replaying the S6 reference frames puts the ghost on the played hand at every scale and
rotation, and the registration is unit-tested independently of any drawing.

### L5 — Hit detection and honest feedback ✅

1. **A window per bar**, centred on the downbeat and roughly a beat wide, scored against the
   committed identity with the pipeline subtracted.
2. **Grade the failure, not just the miss:** right chord late, right degree with the wrong lean,
   wrong degree, or never played. These are four different problems with four different fixes, and
   "✗" teaches none of them.
3. **A loop summary** — "3 of 4; the iv came 180 ms late" — and nothing more. No score, no streak,
   no stars.
4. **Never punish with silence.** A wrong chord still sounds. The instrument does not editorialise.

*Done when:* recorded sessions replay through the grader in tests with fixed timings, so the grading
rules can be changed without a camera.

**L5 depends on [D6](./06-accuracy-plan.md#d6--make-misclassification-visible) for its credibility.**
If the classifier misreads a pose, guide mode will confidently blame the player for a fault in the
tracker. Shipping the scoring before the tracker can say what it saw is the one sequencing mistake
in this plan that would do real damage.

### L6 — Learn mode, and a library ✅

1. **Learn mode: the song waits for you.** No clock, no drums; the loop advances only when you hit
   the chord. This is how the poses are learned, and it removes timing from a problem that is not
   yet about timing.
2. **Play mode** is L1–L5 at tempo, with the tempo scale exposed as a control.
3. **Free play** stays the default. The instrument is not a game that happens to have a synth in it.
4. **A song picker**, and songs two and three chosen for *vocabulary coverage* rather than taste —
   between them they should reach the VI horns pose, the five-finger V that S8 had to fix, and a
   7th voicing. "Zombie" (vi IV I V) and "With or Without You" (I V vi IV) both qualify. Degree VII
   remains unexercised by any song worth playing, which is worth knowing.

*Done when:* someone who has never used the app can pick Creep, learn the four poses in Learn mode,
and play the loop through at 92 BPM without reading the guide.

### L7 — Both hands, in the same shapes ✅

L1–L6 taught one hand. The instrument has two, and the second one was never mentioned: a player who
is not told what to do with their right hand does something with it anyway, and the voicing changes
under them for reasons they cannot see.

1. **One source of hand shape.** The skeleton, the fingertips and the lean dial move into `pose.ts`,
   and the canvas overlay imports them. The ghost on your hand and the diagram beside the chord are
   then the same template rendered twice — a picture cannot teach a pose the instrument would not
   read, because there is only one pose.
2. **A diagram component**, in SVG rather than canvas, because it belongs to the type system and
   should scale, sit in a flow, and inherit its colour like everything else in the panel.
3. **Both hands in the panel**: the chord hand, tilted the way the wrist has to lean and carrying the
   same dial the overlay draws live, and the sound hand beside it. They sit *below* the lane rather
   than inside it, so the picture you are copying does not slide sideways every bar.
4. **A ghost on the right hand too**, faded the moment it is right.

*Done when:* the two hands in the panel and the two ghosts on the player are the same drawing, and
the poses are countable at lane size.

## What was built

### The clock

`transport.ts` is two pieces: a `Timeline` that is pure arithmetic — beat index to time, time to
beat, count-in, loop, tempo — and a `Transport` that looks every 25 ms and schedules everything
inside the next 120 ms. Splitting them that way is what makes the beat grid testable without a
browser: the loop seam, the count-in boundary and a tempo change mid-bar are all assertions about
numbers, and the only untested part left is a `setInterval`.

Tempo changes re-anchor on the current position rather than restarting the grid, so nudging the
tempo bends the music from here instead of sliding everything that has already been played.

### The kit

Kick, snare and hat from one noise buffer and three envelopes — no samples, for the same reason S1
removed Tone.js. Drums join at `SynthGraph.mix`, which is the point after the chord's reverb and
before the limiter: percussion through a 2.4-second convolution is mud, and the limiter is the only
thing protecting the sum of drums and chord.

`npm run audio` now renders that sum. **Worst case with the kit measures 0.85–0.87 peak** — it moves
between runs because the noise burst is random — **against 0.835 for the chord alone and 1.0 for full
scale, with zero clipped samples.** That measurement is the reason the
drums are allowed to exist; adding them without retaking it would have been guessing.

### The ghost hand

The registration turned out to be the elegant part. A frame is read from the player's own landmarks
— wrist as origin, wrist-to-middle-knuckle as *up* and length, index-knuckle-to-pinky-knuckle as
*across* — and the template is drawn in that frame. Because `across` is carried by the hand itself,
**handedness never appears in the code**: a left hand and a right hand differ only in the sign of a
vector they bring with them, and the same template lands correctly on either. The round trip
(place a template in a frame, read the frame back off the result) is exact, and is a test.

The template is generated rather than captured, which is a departure from the plan. D1's dataset does
not exist yet, and hand-authoring 21 landmarks by eye is exactly the failure the plan warned about —
so digits are built from knuckle positions and segment lengths in palm units, with one rule for the
two states: a raised digit follows its own splay angle with a little natural bend, a curled one
**folds toward the palm centre** and foreshortens. One rule for five digits, no per-pose tables, and
a tucked thumb falls out of it for free. When D1 lands, a captured frame can replace the generator
without the renderer noticing.

The lean is drawn as a **pendulum under the wrist**, geared up 3.2×, with the half of the dial the
song is asking for lit and the needle showing where the wrist actually is. Major and minor are a zero
crossing about a tenth of a radian wide; at life size it is invisible, which is why the band is
imported from `chords.ts` rather than copied — a lean cue that disagrees with the lean is worse than
no lean cue.

### Both hands

The sprint turned out to be mostly a deletion. `CONNECTIONS`, `TIPS` and the dial's constants were
private to `overlay.ts`; moving them into `pose.ts` and letting a React component import the same
`handTemplate` meant the diagram needed no geometry of its own — it is a `place()` call, a bounding
box, and some stroke widths.

Two things only became visible once drawn:

- **Sub-pixel strokes.** A stroke width proportional to palm size gives 0.64 px at lane size, which
  is not a thin line but a grey smudge. Every stroke now has a floor of 1.2 px, and the poses became
  countable at 24 px — the whole difference between a diagram and a decoration.
- **Opacity cannot carry a two-state dial.** The lit half of the lean dial was distinguished from
  the track by opacity alone; at hairline weights the two read as one grey arc. The lit half now
  wins by *weight*, which survives being small.

The diagram's tilt (±13°) is illustrative and says so in the source. The real decision is a couple of
degrees either side of vertical: legible as a geared dial on your own wrist, invisible as a drawing
of a hand.

### The grading

`gradeBar` is a pure function and the question it asks is *"what was sounding on the downbeat"*,
not *"was a change made near it"*. That distinction is the whole design: a chord reached a beat early
and held is ideal playing, and a grader built around change events would call it a miss.

The engine timestamps every commit at `now - CHORD_HOLD_MS` — the moment the hand arrived, not the
moment the chord was accepted. That one subtraction removes the entire latency term from the grader:
there is no pipeline constant in `practice.ts` to drift out of date.

**This shipped before D6, against the warning three paragraphs up.** Two things take the edge off it
and neither is a substitute: the grades separate *wrong degree* from *wrong lean*, which is already
some of what D6 would show, and Learn mode is the default, so nothing is graded until the player asks
to be. If the classifier misreads a pose in Play mode, the app will still blame the player for it.
That is a debt, and D6 is where it gets paid.

### Two modes, one session

Learn mode is the same session with the transport switched off: the target advances when the player
reaches it. It is four lines of difference and it is the mode to start in, because timing is not yet
the problem when the poses are still being learned.

## Still unverified

- **The ghosts over live hands.** The geometry is unit-tested and every pose has been rendered and
  looked at, but nothing has yet put a real hand under one. Scale, rotation and side are exact by
  construction; whether two ghosts read as help or as clutter needs a camera.
- **The kit against the chords, by ear.** It is measured — 0.869 peak, no clipping — but level and
  taste are not the same thing, and `LEVEL` in `drums.ts` was chosen rather than heard.
- **Whether the lead time is teachable.** The cue leads by a beat and the grader is honest about
  lateness, but nobody has yet tried to learn the quarter-beat anticipation from those two signals.

## Sequence, as it was planned

**L1 → L2 → L3** is the play-along. **L4** is the tutorial. **L5** needs D6 in front of it. **L6**
is the packaging.

If only one sprint ever happens, make it **L4**. The chord lane is a chord chart, and the internet
is full of chord charts for Creep; the ghost hand is the thing this app can do that a chord chart
cannot, because the hard part here is not knowing that bar 4 is Cm — it is knowing what Cm looks
like on your own hand.

**L1 and L2 are cheap and immediately useful on their own.** A metronome and a drum loop make the
instrument practisable before any teaching exists at all.

## Practising Creep

The ladder the app walks you up:

1. **Four poses, no clock.** Learn mode. One finger, three, four, four-with-a-lean.
2. **The last transition alone**, looped: bar 3 to bar 4, fingers still, wrist over. It is the only
   move in the song that is not a finger count, and it is the one that will fall apart at tempo.
3. **The loop at 60%** — 55 BPM — with a click. Slow enough that the 150 ms lead is not yet felt.
4. **The loop at 92** with the drum track, right hand doing nothing.
5. **Add the right hand**: raise it through bar 3, roll it outward for the chorus. This is the point
   at which it stops being an exercise.
6. **Space bar for the long bars.** Creep sits on each chord for a full four beats; latching frees
   the left hand to set up the next pose early, which is exactly what the lead time wants.

## Open questions

- **Should a quality-only change commit faster?** Bar 3 → bar 4 keeps the degree and flips the lean,
  and 100 ms of a 652 ms beat is a lot to spend re-proving a chord that has not moved. The argument
  against is that a wrong quality is a wrong note, and confidence should not be cheaper just because
  the change is small. Measure before deciding.
- **Does the ghost hand help or crowd?** Two hands drawn on top of your two hands might read as
  noise. Fade it out once a bar has been hit cleanly a few times in a row, and see whether anyone
  misses it.
- **Playing along to the actual record** is the real reward loop and is out of scope: it needs the
  app's clock locked to an external source, and nothing here provides one.
