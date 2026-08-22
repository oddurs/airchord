// D2: what the features actually look like per pose, and where the classifier
// disagrees with the label. Feature choice belongs to this report, not intuition.
import { readFileSync } from 'node:fs'
import { describeLandmarks } from '../src/lib/features.ts'
import { thumbSignal } from '../src/lib/classifier.ts'

const dataset = JSON.parse(readFileSync('src/lib/fixtures/gestures.json', 'utf8'))
const DIGITS = ['thumb', 'index', 'middle', 'ring', 'pinky']

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

console.log('\nPer-digit straightness, mean over each take (● = should be up)\n')
console.log('pose          side    thumbSig  ' + DIGITS.map((d) => d.slice(0, 5).padStart(7)).join(''))

const rows = []
for (const sample of dataset.samples) {
  const hands = sample.frames.map((f) => describeLandmarks(f, sample.side))
  const ext = DIGITS.map((_, i) => mean(hands.map((h) => h.extension[i])))
  const sig = mean(hands.map((h) => thumbSignal(h)))
  const thumb = {
    toIndex: mean(hands.map((h) => h.thumb.toIndex)),
    toPinky: mean(hands.map((h) => h.thumb.toPinky)),
    abduction: mean(hands.map((h) => h.thumb.abduction)),
  }
  rows.push({ sample, ext, sig, thumb })
  const cells = ext
    .map((v, i) => `${v.toFixed(2)}${sample.expected[i] ? '●' : ' '}`.padStart(7))
    .join('')
  console.log(
    `${sample.label.padEnd(13)} ${sample.side.padEnd(6)} ${sig.toFixed(2).padStart(8)}  ${cells}`,
  )
}

console.log('\nSeparation per digit — expected-up vs expected-down\n')
console.log('digit     up: min   mean    max      down: min   mean    max     gap')
for (let i = 0; i < 5; i++) {
  const up = rows.filter((r) => r.sample.expected[i]).map((r) => r.ext[i])
  const down = rows.filter((r) => !r.sample.expected[i]).map((r) => r.ext[i])
  if (!up.length || !down.length) continue
  const gap = Math.min(...up) - Math.max(...down)
  console.log(
    `${DIGITS[i].padEnd(9)} ${Math.min(...up).toFixed(2)}  ${mean(up).toFixed(2)}  ${Math.max(...up).toFixed(2)}` +
      `        ${Math.min(...down).toFixed(2)}  ${mean(down).toFixed(2)}  ${Math.max(...down).toFixed(2)}` +
      `   ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}`,
  )
}

console.log('\nThumb candidates — expected-up vs expected-down\n')
for (const key of ['toIndex', 'toPinky', 'abduction']) {
  const up = rows.filter((r) => r.sample.expected[0]).map((r) => r.thumb[key])
  const down = rows.filter((r) => !r.sample.expected[0]).map((r) => r.thumb[key])
  const gap = Math.min(...up) - Math.max(...down)
  console.log(
    `${key.padEnd(11)} up ${Math.min(...up).toFixed(2)}–${Math.max(...up).toFixed(2)}` +
      `   down ${Math.min(...down).toFixed(2)}–${Math.max(...down).toFixed(2)}   gap ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}`,
  )
}
console.log('')
