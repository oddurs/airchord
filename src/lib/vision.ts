import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { describeLandmarks, type HandState, type Side } from './features'

export * from './features'

// Both are served from /public by `npm run assets`, so the instrument works
// offline and doesn't stall on a CDN round-trip at startup.
const WASM_ROOT = '/mediapipe/wasm'
const MODEL = '/mediapipe/hand_landmarker.task'

// MediaPipe documents handedness as assuming a mirrored selfie frame, which
// implies a raw getUserMedia frame needs its labels swapped. In practice it does
// not: verified by driving this app with a real (unmirrored) frame of two hands,
// and confirmed against the original, which uses the reported label unswapped.
const SWAP_HANDEDNESS = false

export async function createTracker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
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

