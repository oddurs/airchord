import type { NextConfig } from 'next'

const config: NextConfig = {
  // A production build writes into the same directory `next dev` is serving
  // from, which corrupts a running dev server's webpack runtime. `npm run
  // verify` points its build elsewhere so both can run at once.
  distDir: process.env.BUILD_DIR ?? '.next',
  headers: async () => [
    {
      // Next infers text/plain for .wasm, which blocks streaming compilation and
      // forces MediaPipe down its slower ArrayBuffer fallback path.
      source: '/mediapipe/wasm/:file*.wasm',
      headers: [{ key: 'Content-Type', value: 'application/wasm' }],
    },
    {
      source: '/mediapipe/:file*.task',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
}

export default config
