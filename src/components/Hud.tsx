import type { Hud as HudState } from '@/lib/engine'
import styles from './Hud.module.css'

/**
 * The chord, and the three things that shape it.
 *
 * Register, volume and filter used to be three unrelated treatments in three
 * corners of the screen — two hairlines at opposite edges of a wide window,
 * unlabelled, too far apart to compare. They are the continuous half of the
 * instrument and they are read peripherally while playing, so they belong
 * together, labelled, in one place.
 *
 * Register and volume are both driven by how high a hand is held, so both are
 * vertical and side by side. Filter is a sweep either side of centre, so it is
 * not.
 */
export default function Hud({ hud }: { hud: HudState }) {
  const playing = hud.name !== null

  return (
    <>
      {playing && (
        <output className={styles.chord} aria-label={`${hud.name} ${hud.quality}`}>
          {hud.latched && <span className={`${styles.held} label`}>Held</span>}
          <span className={styles.line}>
            <span className={styles.name}>{hud.name}</span>
            <span className={styles.numeral}>{hud.numeral}</span>
          </span>
          <span className={`${styles.quality} label`}>
            {hud.quality}
            {hud.octave !== 0 && (
              <span className={styles.octave}>{hud.octave > 0 ? '8ve up' : '8ve down'}</span>
            )}
          </span>
        </output>
      )}

      <aside className={styles.state} aria-hidden="true">
        <div className={styles.gauges}>
          <div className={styles.gauge}>
            {/* Zones drawn, not just the one you are in: the boundary you are
                approaching is what makes the control learnable. */}
            <div className={styles.register}>
              {[1, 0, -1].map((zone) => (
                <span
                  key={zone}
                  className={`${styles.zone} ${hud.octave === zone ? styles.zoneOn : ''}`}
                />
              ))}
              <span className={styles.hand} style={{ bottom: `${hud.handHeight * 100}%` }} />
            </div>
            <span className={`${styles.gaugeLabel} label`}>Reg</span>
          </div>

          <div className={styles.gauge}>
            <div className={styles.meter}>
              <span className={styles.level} style={{ transform: `scaleY(${hud.volume})` }} />
            </div>
            <span className={`${styles.gaugeLabel} label`}>Vol</span>
          </div>
        </div>

        <p className={`${styles.filter} label tabular`}>
          <span className={styles.filterLabel}>Filter</span>
          <span className={styles.filterTrack}>
            <span
              className={styles.filterFill}
              style={{
                left: hud.filter < 0 ? `${50 + hud.filter / 2}%` : '50%',
                width: `${Math.abs(hud.filter) / 2}%`,
              }}
            />
          </span>
          <span className={styles.filterValue}>
            {hud.filter > 0 ? '+' : hud.filter < 0 ? '−' : ''}
            {Math.abs(hud.filter)}
          </span>
        </p>
      </aside>
    </>
  )
}
