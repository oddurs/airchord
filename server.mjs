import { createServer as createHttp } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { createServer as createTcp } from 'node:net'
import next from 'next'
import { ensureCerts, lanAddresses } from './scripts/certs.mjs'

const port = Number(process.env.PORT ?? 9191)
const dev = process.env.NODE_ENV !== 'production'
const { key, cert, trusted } = ensureCerts()

const app = next({ dev, hostname: '0.0.0.0', port })
await app.prepare()

const secure = createHttps({ key, cert }, app.getRequestHandler())

// Typing "localhost:9191" gets you http://, and a TLS-only socket answers that
// with a protocol error rather than anything a human can act on. So both
// protocols share the port: peek the first byte and route accordingly.
const redirect = createHttp((req, res) => {
  const host = (req.headers.host ?? `localhost:${port}`).replace(/:\d+$/, `:${port}`)
  res.writeHead(301, { Location: `https://${host}${req.url}` })
  res.end('Camera access needs https. Redirecting.\n')
})

createTcp((socket) => {
  socket.once('data', (chunk) => {
    // Pause before pushing the bytes back, or the peeked handshake is consumed
    // by this handler and TLS never sees it. Resume once the real server has
    // attached its own listeners.
    socket.pause()
    socket.unshift(chunk)
    // 0x16 is a TLS handshake record; anything else is plaintext.
    const target = chunk[0] === 0x16 ? secure : redirect
    target.emit('connection', socket)
    process.nextTick(() => socket.resume())
  })
  socket.on('error', () => socket.destroy())
}).listen(port, '0.0.0.0', () => {
  console.log(`\n  airchord ${dev ? 'dev' : 'production'}\n`)
  console.log(`  ➜  local:   https://localhost:${port}`)
  for (const ip of lanAddresses()) console.log(`  ➜  network: https://${ip}:${port}`)
  if (!trusted) console.log('\n  ⚠  self-signed cert — expect a browser warning; iOS needs mkcert (see README)')
  console.log('')
})
