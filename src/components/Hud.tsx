import type { Hud as HudState } from '@/lib/engine'
import styles from './Hud.module.css'

export default function Hud({ hud }: { hud: HudState }) {
  const playing = hud.name !== null

  return (
    <>
      {playing && (
        <output className={styles.chord} aria-label={`${hud.name} ${hud.quality}`}>
          {hud.latched && <span className={`${styles.held} label`}>Held</span>}
          <span className={styles.line}>
            <span className={styles.name}>{hud.name}</span>
            {/* Italic serif roman numerals read the way harmonic analysis is set. */}
            <span className={styles.numeral}>{hud.numeral}</span>
          </span>
          <span className={`${styles.quality} label`}>
            {hud.quality}
            {hud.octaveDown && <span className={styles.octave}>8ve down</span>}
          </span>
        </output>
      )}

      <div className={styles.readout}>
        <div className={styles.meter} aria-hidden="true">
          <span className={styles.level} style={{ transform: `scaleY(${hud.volume})` }} />
        </div>
        <p className={`${styles.filter} label tabular`}>
          <span className={styles.filterLabel}>Filter</span>
          <span className={styles.filterValue}>
            {hud.filter > 0 ? '+' : hud.filter < 0 ? '−' : ''}
            {Math.abs(hud.filter)}
          </span>
        </p>
      </div>
    </>
  )
}
