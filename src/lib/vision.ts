import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { describeLandmarks, type HandState, type Side } from './features'

export * from './features'

// Both are served from /public by `npm run assets`, so the instrument works
// offline and doesn't stall on a CDN round-trip at startup.
//
// The base path must be applied here: a GitHub Pages project site serves from a
// subdirectory, and these are fetched by absolute URL rather than bundled, so
// they are invisible to Next's own asset rewriting. Without it the page loads,
// the camera starts, and hand tracking silently never begins.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const WASM_ROOT = `${BASE}/mediapipe/wasm`
const MODEL = `${BASE}/mediapipe/hand_landmarker.task`

// MediaPipe documents handedness as assuming a mirrored selfie frame, which
// implies a raw getUserMedia frame needs its labels swapped. In practice it does
// not: verified by driving this app with a real (unmirrored) frame of two hands,
// and confirmed against the original, which uses the reported label unswapped.
const SWAP_HANDEDNESS = false

/**
 * Fetches the hand-landmark model, reporting progress as it streams.
 *
 * MediaPipe will happily fetch it itself from `modelAssetPath`, but gives no
 * way to observe it — and it is 7.8MB, which on a first visit is long enough
 * that a silent wait reads as a broken page. Streaming it here and handing over
 * the bytes buys an honest progress bar for a few lines.
 */
export async function loadModel(onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const response = await fetch(MODEL)
  if (!response.ok) throw new Error(`Could not load the hand model (${response.status})`)

  const total = Number(response.headers.get('content-length') ?? 0)
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(await response.arrayBuffer())

  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    // Without a content-length there is nothing honest to report, so the bar
    // stays indeterminate rather than inventing a number.
    if (total > 0) onProgress(Math.min(1, received / total))
  }

  const model = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    model.set(chunk, offset)
    offset += chunk.length
  }
  onProgress(1)
  return model
}

export async function createTracker(model: Uint8Array): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: model, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  })
}

export function readHands(
  tracker: HandLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): HandState[] {
  const result = tracker.detectForVideo(video, timestamp)
  const labels = result.handedness ?? result.handednesses ?? []

  return result.landmarks.map((landmarks, i) => {
    const category = labels[i]?.[0]
    const raw = category?.categoryName === 'Left' ? 'left' : 'right'
    const side: Side = SWAP_HANDEDNESS ? (raw === 'left' ? 'right' : 'left') : raw
    return describeLandmarks(landmarks, side, category?.score ?? 1)
  })
}

