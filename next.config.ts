import type { NextConfig } from 'next'

/**
 * GitHub Pages serves a project site from a subdirectory, so every absolute path
 * needs prefixing. It is exposed to the client too, because the MediaPipe wasm
 * and model are fetched by absolute path at runtime and would otherwise 404 —
 * which presents as "the camera works but hand tracking never starts".
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const isExport = process.env.STATIC_EXPORT === '1'

const config: NextConfig = {
  // A production build writes into the same directory `next dev` is serving
  // from, which corrupts a running dev server's webpack runtime. `npm run
  // verify` points its build elsewhere so both can run at once.
  distDir: process.env.BUILD_DIR ?? '.next',

  ...(isExport ? { output: 'export' as const, images: { unoptimized: true } } : {}),
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),

  // Headers need a server. The static export has none — GitHub Pages serves
  // .wasm with the right type itself, so nothing is lost.
  ...(isExport
    ? {}
    : {
        headers: async () => [
          {
            // Next infers text/plain for .wasm, which blocks streaming
            // compilation and forces MediaPipe down its slower fallback path.
            source: '/mediapipe/wasm/:file*.wasm',
            headers: [{ key: 'Content-Type', value: 'application/wasm' }],
          },
          {
            source: '/mediapipe/:file*.task',
            headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
          },
        ],
      }),
}

export default config
