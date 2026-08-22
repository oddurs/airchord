'use client'

import { useEffect } from 'react'

/**
 * A runtime fault should look intentional rather than like a blank page. The
 * instrument asks for camera access, so a silent failure is exactly the moment a
 * person decides something untrustworthy is happening.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 24,
        textAlign: 'center',
        background: 'var(--ground)',
        color: 'var(--ink-strong)',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 500, letterSpacing: '-0.045em', color: 'var(--ink-full)' }}>
        Airchord stopped
      </h1>
      <p style={{ margin: 0, maxWidth: '34em', lineHeight: 1.7, color: 'var(--ink-quiet)' }}>
        Something went wrong while the instrument was running. Nothing was recorded or sent anywhere.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 18,
          padding: '10px 0 0',
          minWidth: 200,
          background: 'none',
          border: 0,
          borderTop: '1px solid var(--hairline)',
          font: 'inherit',
          fontSize: 10.5,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 500,
          color: 'var(--ink-full)',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </main>
  )
}
