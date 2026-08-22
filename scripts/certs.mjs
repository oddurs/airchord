import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'

const DIR = path.resolve('certs')
const KEY = path.join(DIR, 'localhost-key.pem')
const CERT = path.join(DIR, 'localhost.pem')

/** Every address the dev server should be reachable on, for the cert's SAN list. */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address)
}

function has(bin) {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * getUserMedia only runs in a secure context, so hitting the app from a phone on
 * the LAN needs real TLS. mkcert is strongly preferred: iOS Safari silently
 * refuses camera access on an untrusted certificate, and only mkcert gives you a
 * CA you can actually install on the device.
 */
export function ensureCerts({ quiet = false } = {}) {
  if (existsSync(KEY) && existsSync(CERT)) {
    return { key: readFileSync(KEY), cert: readFileSync(CERT), trusted: existsSync(path.join(DIR, '.mkcert')) }
  }

  mkdirSync(DIR, { recursive: true })
  const names = ['localhost', '127.0.0.1', '::1', ...lanAddresses()]

  if (has('mkcert')) {
    execFileSync('mkcert', ['-key-file', KEY, '-cert-file', CERT, ...names], { stdio: quiet ? 'ignore' : 'inherit' })
    execFileSync('sh', ['-c', `echo mkcert > ${JSON.stringify(path.join(DIR, '.mkcert'))}`])
    if (!quiet) {
      const root = execFileSync('mkcert', ['-CAROOT']).toString().trim()
      console.log(`\n  CA root for phones/tablets: ${path.join(root, 'rootCA.pem')}`)
    }
    return { key: readFileSync(KEY), cert: readFileSync(CERT), trusted: true }
  }

  const san = names.map((n) => (/^[\d.]+$/.test(n) || n === '::1' ? `IP:${n}` : `DNS:${n}`)).join(',')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
    '-keyout', KEY, '-out', CERT,
    '-subj', '/CN=handi-chord-dev',
    '-addext', `subjectAltName=${san}`,
  ], { stdio: quiet ? 'ignore' : 'inherit' })

  if (!quiet) {
    console.log('\n  ⚠  Fell back to a self-signed cert (mkcert not installed).')
    console.log('     Desktop browsers work after clicking through the warning.')
    console.log('     iOS Safari will NOT grant camera access on it — run: brew install mkcert && mkcert -install')
    console.log('     then delete ./certs and restart.\n')
  }
  return { key: readFileSync(KEY), cert: readFileSync(CERT), trusted: false }
}

if (process.argv[1] === new URL(import.meta.url).pathname) ensureCerts()
