import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// One family, self-hosted at build time. Hierarchy comes from size, weight and
// tracking rather than from a second voice.
const ui = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
})

export const metadata: Metadata = {
  title: 'Handi Chord',
  description: 'A gesture-controlled chord synthesiser. Raise fingers to pick chords, tilt to shape them.',
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
