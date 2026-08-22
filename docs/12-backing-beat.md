# A backing beat, and the tutorials put away

The song tutorials were built to teach a progression: a lane of upcoming chords, ghost hands, per-bar
grading, an arrangement with sections and an ending. It is a lot of machinery to meet before you have
enjoyed making a sound, and it answers a question — *how do I play this particular song* — that comes
after the one most people actually have, which is *what does this thing do*.

So they are hidden, not removed. `?songs` still reaches the panel, the same way `?capture` reaches the
dataset tool and `?tour` replays the welcome. Nothing was deleted; the transport, the arrangement and
the grading are all still there and still tested.

What replaces them is smaller and, for someone with their hands up, more use: **something to play
along to.**

## What it is

A loop, a time signature, and a tempo. `Beat` is off, `4/4`, `3/4` or `6/8`; `Tempo` is a slider.
There is nothing to load and nothing to arrange.

Positions are written in quarter-note beats, so the tempo means the same thing in every signature.
That has a pleasing consequence: **6/8 and 3/4 are the same three beats and differ only in where the
weight falls** — the waltz puts a snare on two and three, the compound pattern puts one on the second
dotted-quarter pulse. Which is exactly how the two feel part company in the music, and it is the whole
implementation of the difference.

Every fourth bar plays a variation rather than the pattern. Often enough to be a shape, rarely enough
not to become a hook.

## Why it is not the song transport

`Timeline` and `Transport` model an arrangement: a count-in, sections, an ending, a tempo map. A
backing beat has none of those and loops forever. Passing `bars: Infinity` to make it fit would have
been a worse thing than the fifty lines in `beat.ts`, which schedule a bar at a time and can be
re-tempoed at any bar line. It also left the other session's pause/resume work completely unblocked,
which mattered more that afternoon than the reuse would have.

**Tempo changes re-anchor rather than restart.** The next bar still begins exactly when it was going
to, and only the bars after it change spacing — changing the tempo should never move the beat you are
already hearing.

## Making it sound like it belongs

The kit was one generic rock voicing. It is now voiced by the instrument's own voice: each `Timbre`
carries the kick's tuning and decay, the snare's centre and Q, the hat's brightness, the level, and
how much of the kit goes into **the same reverb the chords are in**.

That last one is the glue. The kit is otherwise dry — a snare through a 2.4-second convolution is mud
— but a measured fraction of it in the chords' room is the difference between a beat in the recording
and a beat next to it. Felt takes 0.12 of it, Glass 0.24, Nylon 0.05, which is the same choice each
voice makes about its own reverb.

The send taps the reverb input, which sits *downstream* of the master gain. So the beat does not duck
when the player lowers their hands — the chords fade and the beat keeps time, which is what a backing
track is for. Worth stating because the other reading is just as plausible until you follow the graph.

## Measured

The one part of this that cannot be read is whether it sounds right, so the harness renders a real bar
of each pattern through the real kit at a real tempo and checks that every scheduled hit produced
audible energy where it was scheduled. A pattern that schedules silence is the one defect a listener
cannot tell from a pattern that is simply sparse.

| | hits | peak |
|---|---|---|
| felt 4/4 | 8/8 | 0.328 |
| felt 3/4 | 6/6 | 0.328 |
| felt 6/8 | 6/6 | 0.354 |

Worst peak across everything — chords, kit, strum, room — **0.848 of full scale, zero clipped
samples**.

Adding those renders was briefly enough to make the whole check hang: enough offline contexts in one
page to lose the debugging socket, which surfaces as a timeout with no error. One render per pattern
is enough, because each voice's kit is already measured in the mix render above it.
