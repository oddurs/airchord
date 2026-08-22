# The experience: elegance, silence, and transitions

The instrument works. What it does not yet have is *composure* — it makes sound when it should not,
changes chords through states you did not ask for, and jumps octaves without explaining itself.

## The root cause

**There is no such thing as "not playing".** Silence is not a state the instrument can be in; it is
what happens when several independent timers all fail to produce a chord at once. Sound is the
default and quiet is an accident, which is exactly backwards for an instrument.

Concretely, right now:

- A hand held in grace after leaving the frame still feeds the classifier, so a **stale hand can
  commit a chord that was never played**. Grace was meant to *sustain* what is already sounding, not
  to authorise a change.
- `resting` is only evaluated for a hand the tracker can currently see, so a hand that leaves the
  frame is never resting — it is "absent", which is treated more permissively.
- **Nothing handles the tab being hidden, the camera stream ending, or the device changing.** Walk
  away mid-chord and it plays to an empty room.
- Hands exiting the frame degrade before they disappear. The last few frames of a hand sliding out
  of shot are garbage poses, and they are treated exactly like a deliberate one.

## X1 — Make silence a state, not an accident

The spine of everything below: replace the accumulated conditionals with an explicit state machine.
`Idle → Armed → Playing → Sustaining → Lost → Idle`, with one readable table saying which inputs
cause which transitions and when sound is permitted. It becomes provable and exhaustively testable
instead of emergent.

1. **Grace sustains; it never authorises.** A grace-held hand may keep the current chord alive but
   must not be able to commit a different one.
2. **Reject hands leaving the frame.** Landmarks near or beyond the frame edge are a hand on its way
   out; that is not a pose. Cheap to detect and it removes the worst ghost chords.
3. **Confidence needs hysteresis too.** A hand hovering at the 0.6 floor currently blinks in and out
   of existence, re-arming grace each time.
4. **Release on every exit**: no hands beyond the grace window, tab hidden, stream ended, device
   changed. Suspend the audio context when nothing is sounding.
5. **Ease in on start.** Beginning with your hands already in a pose currently starts at full
   volume the instant tracking begins.

*Done when:* hands out of frame produce silence, every time, within one predictable interval — and a
test proves it from recorded landmarks.

## X2 — Chord transitions

Moving from one finger to four passes through two and three. The 100 ms hold hides that only if you
move fast; move slowly and you hear every chord on the way.

1. **Gate on stillness, not only on time.** A hand in transit has high landmark velocity; a hand
   holding a pose is still. Committing on *settling* rather than on a timer is both more musical and
   more forgiving — you can take as long as you like to get there.
2. **Tier the commit by how much of the sound changes, not by which hand it came from.** This is the
   principle the current code gets wrong, and the octave is the clearest casualty (see X3).
3. **Mask genuine changes.** A real player re-articulates; a tiny dip and recovery across a chord
   change hides the seam far better than a faster crossfade.
4. Keep voice leading — common tones are already held and should stay held.

## X3 — The octave

Reported directly: the jumps are harsh and hard to predict. Three separate causes, all fixable.

1. **It is the largest change in the instrument and gets the fastest commit.** The octave lives in
   the "colour" tier at 40 ms alongside voicing. But a voicing change moves one or two notes, while
   an octave change moves *every* voice — so it tears down and rebuilds all four at a 14 ms
   crossfade. It should commit on the slow tier and cross-fade over a longer window.
2. **It rides the least reliable signal in the instrument.** The thumb has roughly 0.04 of margin
   either side, which is documented as the narrowest measurement we have. Putting the most drastic
   musical change on the least certain input is the actual design error.
3. **It is invisible.** Nothing shows the thumb's state, so an unexpected octave has no explanation
   on screen. The player cannot learn a control they cannot see.

Worth considering: an octave that *glides* rather than jumps, or one that only takes effect on the
next chord change rather than mid-chord. Both are more musical than a mid-note leap, and both are
easier to understand because they happen when you expect a change anyway.

## X4 — Tell the player what the instrument sees

Silence with no explanation reads as broken rather than as intentional.

1. **Per-finger state on the overlay**, including the thumb.
2. **Say why it is silent**: no hands, resting, pose not recognised, waiting to settle.
3. **Show a commit about to happen**, so a chord change is anticipated rather than surprising.
4. **Show the octave** as a state, not just as a suffix on a label.

## X5 — Fit the player

1. **Volume is absolute to the frame.** Sit low and you can never reach full volume. It should map
   to your own reach.
2. **Neutral roll is personal** — measured at +0.135 for one left hand, and the sticky-minor bug came
   from assuming it. Calibration is the real fix rather than a better constant.
3. Store locally, re-runnable when something feels off.

## X6 — Session robustness

Camera unplugged, permission revoked mid-session, tab backgrounded, laptop slept, second camera
connected. Each should degrade to something honest and recover without a reload.

## Sequence

**X1 → X2 → X3** first: they are the ones that make it feel composed rather than twitchy, and X1's
state machine is what makes the other two straightforward instead of another layer of conditionals.

**X3 is the one to pull forward if only one thing gets done** — it was reported from real playing,
it has three independent causes, and two of them are one-line tier changes.

X4 next, because a player who can see what the instrument sees can learn around anything left.
