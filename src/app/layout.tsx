import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// One family, self-hosted at build time. Hierarchy comes from size, weight and
// tracking rather than from a second voice.
const ui = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
})

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const DESCRIPTION =
  'A chord synthesiser you play with your hands. Raise fingers to pick chords, tilt your wrists to shape them — all in the browser, with nothing leaving your device.'

export const metadata: Metadata = {
  title: 'Airchord',
  description: DESCRIPTION,
  applicationName: 'Airchord',
  manifest: `${BASE}/manifest.webmanifest`,
  openGraph: {
    title: 'Airchord',
    description: DESCRIPTION,
    type: 'website',
    images: [{ url: `${BASE}/og.png`, width: 1200, height: 630, alt: 'Airchord' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Airchord',
    description: DESCRIPTION,
    images: [`${BASE}/og.png`],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  )
}
