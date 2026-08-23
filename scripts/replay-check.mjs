import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Replays a session through the real engine and reports how steady it stayed.
// The unit tests judge whether a held pose picks the right chord; this judges
// whether the instrument stays put, which is the property that keeps failing
// and which held poses cannot measure.

const URL_ = process.env.REPLAY_CHECK_URL ?? 'https://localhost:9191/'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9334
const PROFILE = path.join(tmpdir(), `airchord-replay-${process.pid}`)

const SANDBOXED = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--ignore-certificate-errors',
    '--mute-audio',
    ...SANDBOXED,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
let chromeStderr = ''
chrome.stderr?.on('data', (c) => (chromeStderr += c.toString()))

function cleanup() {
  chrome.kill()
  try {
    rmSync(PROFILE, { recursive: true, force: true })
  } catch {
    // A stale profile directory is harmless.
  }
}

try {
  let targets
  for (let attempt = 0; attempt < 25 && !targets; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    } catch {
      await wait(300)
    }
  }
  if (!targets) {
    const detail = chromeStderr.trim().split('\n').slice(-3).join('\n      ')
    throw new Error(`Chrome did not expose a debugging port${detail ? `\n      ${detail}` : ''}`)
  }

  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('could not attach to the page'))
  })

  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params }))
    })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: URL_ })

  let report = null
  for (let attempt = 0; attempt < 30 && !report; attempt++) {
    await wait(500)
    const { result } = await send('Runtime.evaluate', {
      expression: 'window.__replayCheck ? JSON.stringify(window.__replayCheck()) : null',
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.value) report = JSON.parse(result.value)
  }
  if (!report) throw new Error(`no replay harness at ${URL_} — is the dev server running?`)

  const { metrics, intended, spurious, passed } = report
  console.log('\n  replayed session\n')
  console.log(`  frames            ${metrics.frames}`)
  console.log(`  duration          ${metrics.seconds}s`)
  console.log(`  chord changes     ${metrics.changes}   (${intended + 1} intended)`)
  console.log(`  spurious          ${spurious}`)
  console.log(`  changes / minute  ${metrics.changesPerMinute}`)
  console.log(`  longest hold      ${metrics.longestHold}s`)
  console.log(`  dropouts          ${metrics.dropouts}`)
  console.log('\n  frames by state\n')
  for (const [reason, n] of Object.entries(metrics.reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(24)} ${n}`)
  }

  if (!passed) {
    console.error(
      `\n  replay check failed: ${spurious} chord${spurious === 1 ? '' : 's'} sounded that nobody asked for\n`,
    )
    process.exitCode = 1
  } else {
    console.log('\n  ✓ replay check passed\n')
  }
} catch (err) {
  console.error(`\n  replay check error: ${err.message}\n`)
  process.exitCode = 1
} finally {
  cleanup()
}
