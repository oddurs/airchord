# Airchord

A chord synthesiser you play with your hands, in the browser. Raise fingers to pick a chord, tilt
your wrists to shape it. Your left hand chooses *what* is played; your right hand chooses *how* it
sounds — voicing, octave, filter, and volume.

Hand tracking runs entirely on-device via MediaPipe. Nothing is uploaded or recorded.

## Run it

```fish
npm install
npm run dev
```

Then open **https://localhost:9191**.

The dev server is HTTPS and binds to every interface, so it prints a LAN address too — `getUserMedia`
only works in a secure context, and on a phone `localhost` won't do.

## Playing it

| Left hand | Chord |
|---|---|
| 1–5 fingers | degree I – V |
| index + pinky | degree VI |
| index + pinky + thumb | degree VII |
| tilt inward / outward | major / minor |

| Right hand | Sound |
|---|---|
| 1–4 fingers | root · 1st inversion · maj/min 7th · dom/dim 7th |
| thumb out | octave down |
| roll wrist inward | darker, woodier |
| roll wrist outward | brighter, resonant |
| raise / lower hand | louder / softer |

The wrist roll has a natural dead zone — a hand held normally reads as neutral, so the filter only
engages when you mean it. The quality tilt overrides the key: degree III is diatonically minor, but
leaning the other way forces it major, which is how borrowed chords fall out of a wrist flick.

## Playing a song

Pick one from **Song** at the top of the screen. The instrument transposes it into the key it was
written in and shows you the next four bars.

| Mode | What it does |
|---|---|
| **Learn** | No clock. The song waits until you reach the chord, then moves on. |
| **Play** | In time, with a count-in and a drum track. Tempo down to half speed. |

Below the lane, both hands are drawn: the **chord hand**, leaning the way your wrist has to go, and
the **sound hand**, which holds root position throughout. The same shapes are drawn on top of your
own hands as you play — dashed, with a ring on each finger that has to be up, and a **dial under your
wrist** showing which way to lean and where you currently are. Each fades as you reach it.

After each bar it tells you what happened: on the beat, late and by how much, or right chord and
wrong lean. It grades the moment your *hand* arrived, not the moment the sound started — there is
about 150 ms between those, and blaming you for it would be dishonest. What that lag means in
practice is that your hand has to be in position roughly a quarter of a beat before the downbeat.

**Creep** is four bars — one finger, three, four, then four again with the wrist rolled over — and
they repeat for the whole song.

## Playing it on a phone

iOS Safari refuses camera access on an untrusted certificate — unlike desktop, there's no
click-through. You need a certificate the device actually trusts:

```fish
brew install mkcert
mkcert -install
rm -rf certs        # regenerated on next start, now via mkcert
npm run dev
```

Then get `rootCA.pem` (from `mkcert -CAROOT`) onto the phone — AirDrop is easiest — and:

1. Settings → **Profile Downloaded** → Install.
2. Settings → General → About → **Certificate Trust Settings** → enable full trust for it.

Step 2 is the one everyone misses. A manually installed certificate is not trusted for TLS until
that toggle is on. Then open the LAN URL the server printed.

Without mkcert the server falls back to a self-signed certificate. Desktop browsers work after
clicking through the warning; iOS won't.

## Development

```fish
npm run dev        # https dev server on :9191
npm test           # music-theory and gesture-mapping tests
npm run verify     # typecheck + tests + production build
npm run build      # production build
npm start          # production server
```

`npm run assets` vendors the MediaPipe wasm runtime and the 7.8 MB hand-landmark model into
`public/mediapipe/`. `dev` and `build` run it for you; both directories are gitignored.

### Layout

```
server.mjs           custom HTTPS server (LAN-visible, port 9191)
scripts/             certificate generation, MediaPipe asset vendoring
src/app/             Next.js app router shell
src/components/      HUD, controls, guide, about
src/hooks/           the render loop, and the only bridge into React
src/lib/
  vision.ts          MediaPipe → per-hand features (fingers, roll, tilt, height)
  chords.ts          gesture → notes; scales, degrees, voicings
  songs.ts           songs as degrees, so any key plays them
  transport.ts       the beat grid, scheduled on the audio clock
  drums.ts           a synthesised kit and its patterns
  pose.ts            the target hand shape, and how to fit it to yours
  practice.ts        the session: target, timing, and honest grading
  synth.ts           Web Audio graph
  overlay.ts         canvas: video, landmarks, energy wave
  engine.ts          per-frame mapping, stabilisers
docs/                deconstruction of the original, platform research, sprint plan
```

The 60fps loop lives outside React entirely. `useGestureSynth` wakes the component tree only when a
value the HUD actually displays has changed, which is a few times a second rather than sixty.

## Credit

This is an independent reimplementation of **Gesture Synth** by
[Eric Wei](https://indecisiveeric.com) — [play the original](https://gesture-synth-weld.vercel.app/),
[read its source](https://github.com/ericwei97-cloud/gesture-synth). The gesture vocabulary and
musical design are his.

The original's licence permits adaptations for personal, educational and non-commercial use
**provided credit is given**, and requires the author's permission for commercial use. No code was
copied; see [docs/README.md](./docs/README.md) for how this was built and what that means in
practice.
