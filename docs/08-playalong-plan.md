# Play-along: from a chord chart to a song

[The songs plan](./07-songs-plan.md) built the scaffolding — a clock, a kit, a lane, two ghost hands,
honest grading. What it produced is a **chord chart with a metronome**. That is the right MVP and it
is not a play-along: nothing about it says *Creep* rather than *four bars in G*.

This plan is about the gap between those two, and it is mostly about three things: **the rhythm**,
**where authentic material comes from**, and **the words**.

## Where it actually is

| | Now | What a play-along needs |
|---|---|---|
| Song shape | `Bar[]`, looping forever | Sections, an arrangement, an ending |
| Chord rate | Exactly one per bar | Sub-bar changes, pickups, held bars |
| Drums | One static pattern, every bar identical | Patterns per section, fills, dynamics, feel |
| The chord itself | A sustained pad | Something that lands *on* the beat |
| Tempo | One number | A tempo map, and the right number |
| Words | None | Timed, moving, legible, switchable |
| Content | Three progressions typed by hand | Files the player brings, parsed |
| Grading | Per bar, per loop | Per section, per song |

**The pad is the loudest of these and it is not the drums.** You hold a pose and a chord drones;
nothing you do is rhythmic, so no drum pattern behind it can make the result feel like playing a
song. The instrument has no articulation at all — that is `E3` in [the instrument
plan](./05-instrument-plan.md), deferred twice, and the play-along is what finally forces it.

## What "authentic" costs, and where material comes from

Getting MIDI for these songs is the right instinct: a MIDI file carries the tempo map, the bar
structure, the groove and — in `.kar` and any file with lyric meta events — **the words and their
timings too**. One import path can answer all three requests at once.

The part to be deliberate about is what lives in this repo. A chord progression is not the
copyrightable part of a song; a transcription, a melody and a lyric are. So:

- **The parser ships. The files do not.** A gitignored `songs/` directory the player fills, plus
  drag-and-drop in the browser. The same arrangement every DAW, tab reader and karaoke player uses,
  and the same one that keeps a public repo clean.
- **Where a file comes from is the player's call**: their own transcription, a licensed MIDI store,
  or something they already own. The app should not scrape a lyrics API, and no lyrics or
  transcriptions get committed.
- **The three songs that ship stay clean-room**: degrees, tempo, structure, and a generated backing
  built from the chart. That is `P4`, and it is what makes the *shipped* experience good rather than
  the experience of whoever has the right files.

One more constraint that will not go away: **the instrument plays seven degrees, major or minor.** No
sus, no slash chords, no roots outside the key. Creep's guitar is triads with sus4 hammer-ons and
they are not reachable. Import must **refuse** a song it cannot represent rather than flatten it —
the same rule the song format already follows, and the reason to state it before writing the parser
rather than after.

## Sprints

### P1 — The arrangement

Everything else needs a song to have a shape. Today `Song.bars` is a loop with no beginning or end.

1. **Sections.** `{ name, bars, repeats, intensity }` — intro, verse, chorus, bridge, outro. The
   loop becomes an arrangement with a length and an ending.
2. **Events inside the bar.** A bar carries chord *changes* at beat positions, not one chord. Creep
   does not need this; almost everything else does, and adding it later means rewriting the grader.
3. **A tempo map** rather than a single `bpm`, because P3 will import one.
4. **Tonic and mode.** Zombie is in E minor and is currently stored as `vi` of G, so the lane prints
   `vi IV I V` for a song a musician would write `i VI III VII`. The instrument's degrees stay as
   they are; the *display* learns the song's own tonic. Cheap, and it stops the app teaching a
   analysis that is quietly wrong.
5. **The lane learns about structure**: what section you are in, and how many bars until the next.

*Done when:* Creep plays from its intro to its outro and stops, the schema is round-tripped in tests,
and a song can change chord twice in a bar.

### P2 — The groove

The sprint that makes it feel like a song rather than a grid.

1. **Articulation — the headline.** The player's held chord is re-struck on a rhythm rather than
   held flat: a strum pattern per section, notes offset across the voicing, velocity from the
   pattern. The pose still chooses the chord; the song chooses when it speaks. This is `E3`, and
   `Synth` already has everything needed except a re-trigger that does not click — the voice pool is
   built to retune while silent, so an envelope per strike is the change.
2. **Patterns per section, and fills.** A drum pattern belongs to a section, and the last bar before
   a section boundary takes a fill. The current model — one bar of hits, repeated forever — cannot
   express either; patterns become bar-aware.
3. **Feel:** swing amount, ghost notes, velocity variation, a few milliseconds of humanisation. A
   perfectly quantised kit is why a metronome sounds like a metronome.
4. **Dynamics.** Sections have intensity: Creep's drums do not enter with the first verse, and the
   choruses are not the verses played louder — they are a different pattern.
5. **Expectation-biased commit.** The song knows what chord is coming. A committer that accepts the
   *expected* chord faster than an unexpected one cuts the 100 ms hold on the common case without
   ever accepting a chord the player did not actually form. This is the cheapest latency win
   available and it only exists because there is a song.

*Done when:* a bar renders offline with onsets measured at the times the pattern claims, the audio
check still clears full scale with a strummed chord over a fill, and swing is a number rather than a
feeling.

### P3 — Bring your own MIDI

1. **A Standard MIDI File parser** — header, tracks, variable-length delta times, note on/off, tempo
   (`0x51`), time signature (`0x58`), track names, and **lyric (`0x05`) and text (`0x01`) meta
   events**. Around two hundred lines, no dependency, and pure enough to test against fixtures.
2. **Import as *chart*, not as playback.** Do not attempt General MIDI: it needs a multi-timbral
   synth and an instrument palette, and it would sound like a 1998 web page. Instead **learn the song
   from the file** — tempo map, bars, sections from repeats, chords from the sounding pitch classes,
   the groove from the channel-10 drum track, the bass line from the lowest voice — and play all of
   it on the kit and synth that already exist. Authentic *rhythm*, this project's sound.
3. **Chord detection as a pure function**: pitch classes in a window, scored against the seven
   degrees × major/minor, with hysteresis. It reports what it could not represent instead of
   guessing, and the report is the import UI.
4. **A local library.** Drag a `.mid`/`.kar` onto the app, or drop files in a gitignored `songs/`
   folder. Parsed to the P1 schema, stored locally, never uploaded — the same promise the camera
   already makes.

*Done when:* a file with a tempo map and a drum track produces a chart whose bar lines land where the
file says, and a file the vocabulary cannot express is refused with the reason.

### P4 — Backing, generated from the chart

What makes the *shipped* songs good, and it needs no file at all.

1. **A bass line from the degrees** — root, fifth, passing notes on the change, following the
   section's rhythm. Two octaves below the chord, its own voice on the existing graph.
2. **Arpeggios and a pad** as optional layers, so a verse can be sparse and a chorus full.
3. **It is generated, so it transposes** with the key selector like everything else here.
4. **Mixed under the player, always**, and re-measured by `npm run audio`: bass plus drums plus a
   strummed four-note chord is a new worst case.

*Done when:* Creep with the backing on is recognisably Creep with no imported file, and the mix still
clears full scale.

### P5 — Words that move

1. **Timed lyrics from a file**: `.lrc`, enhanced `.lrc` (word-level), and MIDI lyric events from P3.
   All three are timestamps and text; one internal format.
2. **Two lines, current and next**, with the active word lit when the file has word timing. Anything
   more is a karaoke bar, and this screen is already busy.
3. **Accessible in both senses.** *Available:* files the player brings, no network, works offline.
   *Accessible:* real DOM text rather than canvas; a static full-lyrics panel for screen readers with
   the moving display `aria-hidden`, because a live region announcing every line is unusable;
   `prefers-reduced-motion` drops the sweep and switches lines; adjustable size; a scrim for contrast
   over live video; and an off switch that is remembered.
4. **A tap-to-time tool**, so a player can time their own lines by tapping through the song once.
   Original timing data, no file needed, and it is thirty lines given the transport.

*Done when:* a lyric file plays in sync through a tempo change, and the whole thing can be turned off
and read as a static page.

### P6 — The play-along screen

The panel currently hangs off the top of an instrument UI, and by P5 there will be a lane, two hands,
beat pips, feedback, a chord lockup, an energy wave, two meters and lyrics competing for one frame.

1. **Play-along is a layout, not an overlay.** When a song is running the screen reorganises: words
   and chords own the centre band, the hands sit under them, and the instrument's own HUD demotes to
   the edges.
2. **One thing is primary at a time** — the section you are in decides whether that is the next
   chord's pose or the next line.
3. **It has to survive a laptop screen and a phone**, which the current stack of bands will not.

*Done when:* the whole play-along reads at 1280×720 with nothing overlapping, and the instrument view
is one keystroke away.

### P7 — More songs

Adding a song should be a data task with a checklist, not a code task.

**Per song:** chart verified against a reference recording · tempo and time signature confirmed ·
sections and arrangement · a groove per section · the vocabulary check passes · what it teaches ·
optional lyric and MIDI files, local only.

Candidates, chosen for what they stress rather than for taste:

| Song | Degrees | What it exercises |
|---|---|---|
| Knockin' on Heaven's Door | I V vi · I V IV | Slow, forgiving, a first song after Creep |
| Stand By Me | I vi IV V | The whole finger count, and a bass line that is the song |
| Let It Be | I V vi IV | Sections that actually differ; a piano feel |
| House of the Rising Sun | vi I II IV · III | **6/8**, and a borrowed major on two different degrees |
| Hallelujah | I vi IV V | **12/8** — the first song that is not in four |
| Sweet Home Alabama | V IV I | A groove with no downbeat chord change |
| Hey Jude (outro) | I bVII IV | The only common use of degree **VII**, which nothing else reaches |

Two of these are not in 4/4, which is the point: `beatsPerBar` exists and has never been anything but
four, and code that has only run on one value is untested rather than general.

## Sequence

**P1 → P2** first and together. P1 is a schema change that everything else depends on, and P2 is the
one the ear notices. If only one sprint happens, it is **P2's articulation**: a strummed chord over
the existing drums is a bigger jump in authenticity than a perfect MIDI import of a droning pad.

**P3** next, because it is what was asked for, and because a `.kar` file collapses P3 and P5's timing
into one import. **P4** can precede it if no files materialise — it needs nothing from anyone.

**P5 → P6** together: the words are what force the layout question, and answering it twice is waste.

**P7** continuously, one song at a time, after P1 and P2 make a song worth adding.

## The two hard problems

**Playing against a fixed timeline.** Free time forgives the ~150 ms from pose to sound; a backing
track does not. Three answers, in order of honesty: P2's expectation-biased commit (cheap, real),
showing the lead time rather than hiding it (already done), and — if it is still not enough — letting
the *song* sit a fixed offset behind the player, which is a lie the player will feel as looseness. Do
the first two and measure before considering the third.

**Screen real estate.** Every sprint here adds a band to a frame that also has to show live video and
two hands. P6 is not decoration; without it P5 has nowhere to go.

## Open questions

- **Does the backing need to be muteable per layer?** Practising against drums only, or bass only, is
  how people actually work. Probably yes, and it is nearly free once P4 exists.
- **Should a wrong chord duck the backing?** No — the instrument does not editorialise, and that rule
  was set in L5. Recording it here so it is not reopened by accident.
- **What happens when a song ends?** Stop, loop the section, or a report? A per-song summary is the
  natural end of P1's arrangement plus L5's grading, and nothing currently produces one.
