import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const OUT = path.resolve('public/mediapipe')

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

// The wasm runtime and the 7.8MB model are vendored into /public rather than
// pulled from a CDN: the instrument then works offline, and startup isn't
// gated on a third-party round-trip.
await mkdir(OUT, { recursive: true })
await cp(path.resolve('node_modules/@mediapipe/tasks-vision/wasm'), path.join(OUT, 'wasm'), { recursive: true })
console.log('✓ mediapipe wasm runtime')

const model = path.join(OUT, 'hand_landmarker.task')
if (await exists(model)) {
  console.log('✓ hand_landmarker.task (cached)')
} else {
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`model download failed: ${res.status}`)
  await writeFile(model, Buffer.from(await res.arrayBuffer()))
  console.log('✓ hand_landmarker.task (downloaded)')
}
