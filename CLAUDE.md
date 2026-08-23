# Airchord

A gesture-controlled chord synthesiser. Hand tracking runs in the browser via MediaPipe; the
landmarks drive a Web Audio synth. Left hand picks the chord, right hand shapes it.

## Commands

```fish
npm run dev      # HTTPS dev server on :9191, LAN-visible (camera needs a secure context)
npm run verify   # typecheck + tests + production build — must be green on main
npm run audio    # renders the real signal path offline and measures it
npm test         # unit tests, including replay of the captured gesture dataset
```

`npm run dev` then visit `/?capture` for the gesture dataset tool.

## Rules learned the hard way

**Never set a threshold from a handful of frames.** This has caused three separate bugs: two thumb
features and the major/minor lean. Each was "measured" and each was measured on a sample that could
not contain the failure. `src/lib/fixtures/gestures.json` is ground truth — real hands, labelled
poses, both the vocabulary and its negative space. Any threshold change must be justified against it
and `npm test` must still pass.

**The video-frame feeds are not ground truth.** They are photographs of a screen showing a
compressed video. They read a folded thumb at the same value a real camera gives an extended one.
Smoke test only.

**Measure, then change.** Every real defect in this project was found by rendering or replaying and
reading numbers, never by reading code: output clipping at 4.7× full scale, a thumb rule whose
offset clamped every real value to zero, a neutral hand roll that made minor chords sticky. If you
are about to tune a constant, produce the numbers first.

**No per-note envelope.** Four oscillators run continuously and the master gain is the envelope —
and the master gain is the player's right hand. That is what makes the instrument feel bowed rather
than played. Crossfades exist only to remove discontinuities and must stay inaudible as articulation.

**Rejection is a feature.** A pose must earn a chord. A thumb alone is not a chord; a closed fist is
silence. Without that, noise becomes music.

## Conventions

- **Dev-only hooks**: `window.__airchord` (per-hand features and the latency budget), `__capture`,
  `__audioCheck`. Guarded by `process.env.NODE_ENV` and compiled out of production.
- **Pure vs impure**: `src/lib/features.ts` has no tracker, camera or browser dependency, so
  recordings replay through exactly the code the instrument runs. Keep it that way — it is what
  makes the classifier testable at all.
- **Node runs the tests directly** with type stripping, so imports inside `src/lib` need explicit
  `.ts` extensions and no TypeScript parameter properties.
- **Docs are numbered in `docs/`.** Look before you name one: two sessions have already claimed the
  same number twice. The number is claimed by the file existing, not by the plan intending it.

## Working alongside another agent

Two sessions share this repo. They do **not** share a working tree — that cost us a broken typecheck
and a file edited from both sides at once. Each session takes a **lane**: one task, one branch, one
worktree, one PR. `main` is never worked in; it is only merged into.

```fish
npm run lane <task>       # a worktree beside the repo, branched from origin/main
npm run lanes             # what every lane is doing: ahead, behind, uncommitted, open PR
npm run land              # rebase on main, verify, push, open the PR, squash-merge when CI is green
npm run lane:done <task>  # after it merges: remove the worktree and the branch
```

Lanes live in `../<checkout>-wt/<task>`, named after this checkout rather than the project, so they
sit next to it whatever the directory is called. `node_modules` and `public/mediapipe` are symlinked
into each lane, so a lane costs no install and no
41 MB re-download. Open one and work in it; `cd` back only to read.

Four things happen without being asked — `.claude/settings.json` and `.githooks/pre-commit`:

- **The main checkout is read-only.** Commits and pushes on `main` are refused, by a Claude Code hook
  and by a git hook for everything that is not Claude Code. `ALLOW_MAIN=1` overrides it deliberately.
- **Every turn ends committed.** A lane with uncommitted work is checkpointed as
  `wip: <branch> <time>`, so nothing is lost to a crash, a compaction or the other session.
- **Force-pushing is refused** unless it is `--force-with-lease`.
- **Contended files say so as they are edited**, because the cost of one is a conflict for both.

Those files are `engine.ts`, `synth.ts`, `chords.ts`, `GestureSynth.tsx` and `useGestureSynth.ts`:
everything routes through them. Changes to them go in small, fast, separately-landed PRs — a
long-lived branch touching one is the conflict everybody pays for. Everything else splits by module:
instrument core (`features`, `classifier`, `synth`, `overlay`) versus practice mode (`songs`,
`drums`, `transport`, `pose`, `practice`).

Before starting anything, `npm run lanes`. Before landing anything, read what the other lane has
already merged.

## Attribution

This is an independent reimplementation of **Gesture Synth** by Eric Wei. Its licence permits
adaptation for personal, educational and non-commercial use **provided credit is given**. That
credit is a licence obligation, not a courtesy: it must remain in the About dialog, the README and
the NOTICE file. Commercial use requires the original author's permission. See `LICENSE`.
