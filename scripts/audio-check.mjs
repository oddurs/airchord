import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Renders the instrument offline in a real browser and asserts the output is
// fit to listen to. Web Audio has no Node implementation, so the check drives
// headless Chrome rather than mocking the graph.

const URL_ = process.env.AUDIO_CHECK_URL ?? 'https://localhost:9191/'
const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const PROFILE = path.join(tmpdir(), `airchord-audio-${process.pid}`)

/** Full scale. Anything above this is clipped by the output device. */
const PEAK_CEILING = 1.0
/** A chord change must not be louder in step terms than simply holding one. */
const TRANSITION_TOLERANCE = 1.6

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// CI runners run as root in a container, where Chrome refuses to start without
// these. Without them it exits immediately and the only symptom is a debugging
// port that never opens.
const SANDBOXED = process.env.CI
  ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  : []

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--ignore-certificate-errors',
  '--mute-audio',
  ...SANDBOXED,
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

// Keep Chrome's own complaint; "did not expose a debugging port" on its own
// says nothing about why.
let chromeStderr = ''
chrome.stderr?.on('data', (chunk) => {
  chromeStderr += chunk.toString()
})

function cleanup() {
  chrome.kill()
  try {
    rmSync(PROFILE, { recursive: true, force: true })
  } catch {
    // Best effort; a stale profile directory is harmless.
  }
}

try {
  let targets
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      break
    } catch {
      await wait(300)
    }
  }
  if (!targets) {
    const detail = chromeStderr.trim().split('\n').slice(-3).join('\n      ')
    throw new Error(
      `Chrome did not expose a debugging port${detail ? `\n      ${detail}` : ''}`,
    )
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
      expression: 'window.__audioCheck ? window.__audioCheck().then(JSON.stringify) : null',
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.value) report = JSON.parse(result.value)
  }
  if (!report) throw new Error(`no audio harness at ${URL_} — is the dev server running?`)

  const failures = []

  console.log('\n  levels (full volume, filter open)\n')
  console.log('  case                     peak     rms   clipped')
  for (const l of report.levels) {
    const bad = l.peak > PEAK_CEILING
    if (bad) failures.push(`${l.label} peaks at ${l.peak}`)
    console.log(
      `  ${l.label.padEnd(22)} ${String(l.peak).padStart(6)}  ${String(l.rms).padStart(6)}` +
        `  ${String(l.clipped).padStart(8)}${bad ? '  ✗' : ''}`,
    )
  }

  console.log('\n  chord transitions\n')
  console.log('  case                     step   steady    ratio')
  for (const t of report.transitions) {
    const ratio = t.steadyStep ? t.transitionStep / t.steadyStep : 0
    const bad = ratio > TRANSITION_TOLERANCE
    if (bad) failures.push(`${t.label} steps ${ratio.toFixed(2)}× its steady state`)
    console.log(
      `  ${t.label.padEnd(22)} ${String(t.transitionStep).padStart(6)}` +
        `  ${String(t.steadyStep).padStart(6)}  ${ratio.toFixed(2).padStart(7)}${bad ? '  ✗' : ''}`,
    )
  }

  console.log(
    `\n  worst peak ${report.worstPeak}  ·  clipped samples ${report.totalClipped}\n`,
  )

  if (failures.length) {
    console.error('  audio check failed:')
    for (const f of failures) console.error(`    · ${f}`)
    console.error('')
    process.exitCode = 1
  } else {
    console.log('  ✓ audio check passed\n')
  }
} catch (err) {
  console.error(`\n  audio check error: ${err.message}\n`)
  process.exitCode = 1
} finally {
  cleanup()
}
