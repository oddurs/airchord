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

## Working alongside another agent

`engine.ts`, `GestureSynth.tsx`, `useGestureSynth.ts` and `chords.ts` are the integration points and
the guaranteed conflicts. Changes to them go in small, fast, separately-merged commits. Everything
else splits by module: instrument core (`features`, `classifier`, `synth`, `overlay`) versus practice
mode (`songs`, `drums`, `transport`, `pose`, `practice`).

## Attribution

This is an independent reimplementation of **Gesture Synth** by Eric Wei. Its licence permits
adaptation for personal, educational and non-commercial use **provided credit is given**. That
credit is a licence obligation, not a courtesy: it must remain in the About dialog, the README and
the NOTICE file. Commercial use requires the original author's permission. See `LICENSE`.
