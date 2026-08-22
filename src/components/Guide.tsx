import styles from './Guide.module.css'

const LEFT: [string, string][] = [
  ['One to five fingers', 'degree I – V'],
  ['Index + pinky', 'degree VI'],
  ['Index + pinky + thumb', 'degree VII'],
  ['Lean inward', 'major'],
  ['Lean outward', 'minor'],
]

const BOTH: [string, string][] = [
  ['Lower your hands', 'rest — silence'],
  ['Space, or Hold', 'keep the chord while you rest'],
]

const RIGHT: [string, string][] = [
  ['One finger', 'root position'],
  ['Two fingers', 'first inversion'],
  ['Three fingers', 'major / minor 7th'],
  ['Four fingers', 'dominant / diminished 7th'],
  ['Thumb out', 'octave down'],
  ['Roll wrist', 'filter'],
  ['Raise hand', 'volume'],
]

export default function Guide() {
  return (
    <aside className={styles.guide}>
      <Section title="Left hand" subtitle="which chord" rows={LEFT} />
      <Section title="Right hand" subtitle="how it sounds" rows={RIGHT} />
      <Section title="Either" subtitle="staying playable" rows={BOTH} />
    </aside>
  )
}

function Section({ title, subtitle, rows }: { title: string; subtitle: string; rows: [string, string][] }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>
        <span className="label">{title}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </h2>
      <dl className={styles.rows}>
        {rows.map(([gesture, effect]) => (
          <div className={styles.row} key={gesture}>
            <dt className={styles.gesture}>{gesture}</dt>
            <dd className={styles.effect}>{effect}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
