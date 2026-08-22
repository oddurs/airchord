import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { createServer as createTcp } from 'node:net'
import path from 'node:path'
import { ensureCerts, lanAddresses } from './certs.mjs'

// Serves the static export over HTTPS. Production is a pile of files, but the
// camera still needs a secure context — so previewing the real build on a phone
// needs the same certificate story the dev server has.

const port = Number(process.env.PORT ?? 9191)
const root = path.resolve(process.env.SERVE_DIR ?? 'out')
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

if (!existsSync(root)) {
  console.error(`\n  Nothing to serve at ${root} — run \`npm run build:pages\` first.\n`)
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function resolve(url) {
  let pathname = decodeURIComponent(new URL(url, 'https://localhost').pathname)
  if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/'
  const target = path.join(root, pathname)
  // Refuse anything that climbs out of the served directory.
  if (!target.startsWith(root)) return null
  if (existsSync(target) && statSync(target).isDirectory()) return path.join(target, 'index.html')
  if (existsSync(target)) return target
  return existsSync(`${target}.html`) ? `${target}.html` : path.join(root, '404.html')
}

const handler = (req, res) => {
  const file = resolve(req.url ?? '/')
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found\n')
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}

const { key, cert, trusted } = ensureCerts()
const secure = createHttps({ key, cert }, handler)
const redirect = createHttp((req, res) => {
  const host = (req.headers.host ?? `localhost:${port}`).replace(/:\d+$/, `:${port}`)
  res.writeHead(301, { Location: `https://${host}${req.url}` })
  res.end()
})

createTcp((socket) => {
  socket.once('data', (chunk) => {
    socket.pause()
    socket.unshift(chunk)
    ;(chunk[0] === 0x16 ? secure : redirect).emit('connection', socket)
    process.nextTick(() => socket.resume())
  })
  socket.on('error', () => socket.destroy())
}).listen(port, '0.0.0.0', () => {
  console.log(`\n  airchord — static preview of ${path.relative(process.cwd(), root)}\n`)
  console.log(`  ➜  local:   https://localhost:${port}${base}`)
  for (const ip of lanAddresses()) console.log(`  ➜  network: https://${ip}:${port}${base}`)
  if (!trusted) console.log('\n  ⚠  self-signed cert — iOS needs mkcert (see README)')
  console.log('')
})
