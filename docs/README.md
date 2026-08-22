# handi-chord docs

A gesture-controlled chord synthesiser: raise fingers to pick a chord, tilt the hands to
shape it. This is an independent reimplementation of **Gesture Synth**.

| Doc | What's in it |
|---|---|
| [01-original-spec.md](./01-original-spec.md) | Full behavioural spec of the original, with the exact constants |
| [02-platform-research.md](./02-platform-research.md) | Browser/platform constraints: secure context, iOS, wasm, MediaPipe |
| [03-sprints.md](./03-sprints.md) | Sprint log: parity, bug fixes, design, consistency |
| [04-audio-plan.md](./04-audio-plan.md) | Audio quality audit, DSP sprint log, and the measurement harness |
| [05-instrument-plan.md](./05-instrument-plan.md) | Latency budget and the plan to make it playable as an instrument |
| [06-accuracy-plan.md](./06-accuracy-plan.md) | Why gesture accuracy is poor, and the plan to make the classifier durable |
| [07-project-setup.md](./07-project-setup.md) | Naming, git and worktree workflow, licensing, GitHub Pages deploy, CI |
| [07-songs-plan.md](./07-songs-plan.md) | Play-along songs and tutorials: transport, drums, chord lane, ghost hand |

## Attribution and licence

The original **Gesture Synth** was created by **Eric Wei** ([indecisiveeric.com](https://indecisiveeric.com),
[github.com/ericwei97-cloud/gesture-synth](https://github.com/ericwei97-cloud/gesture-synth)),
deployed at [gesture-synth-weld.vercel.app](https://gesture-synth-weld.vercel.app/).

Its licence is source-available, not OSI open source. Paraphrasing the terms:

- Use, copy, modify and share are permitted for **personal, educational and non-commercial** purposes.
- Building and sharing **your own version or adaptation is explicitly welcomed, provided credit is
  given** to the original project and its creator.
- **Commercial use** — selling it, or folding substantial portions into a paid product — requires
  the author's permission.

Two consequences for this repo, and they are not optional:

1. **Credit must be visible in the app**, not just in a doc. See sprint S4.
2. **No code was copied.** The implementation here is written from observed behaviour and from the
   documented spec. The original source was read to *extract parameter values* — thresholds,
   intervals, filter ranges — which are facts about how the instrument behaves, not authored code.
   If this project ever goes commercial, that has to be cleared with the author first.
