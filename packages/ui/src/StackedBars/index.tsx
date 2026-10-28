import styles from './StackedBars.module.css'

export type SegmentTone = 'good' | 'pending' | 'bad' | 'missing'
export interface Segment { key: string; label: string; value: number; tone: SegmentTone }
export interface Bar { id: string; label: string; detail?: string; segments: Segment[] }

interface Props {
  /** Names the chart for assistive tech, e.g. "Contract data readiness". */
  title: string
  /** Common denominator: every bar spans 0 to total on the same count axis. */
  total: number
  /** What is counted, e.g. "contracts". */
  unit: string
  bars: Bar[]
}

/** Horizontal stacked bars on one zero-based count axis. Presentational only: all counting happens before this. */
export function StackedBars({ title, total, unit, bars }: Props) {
  const step = total <= 10 ? 1 : Math.ceil(total / 5)
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step)
  if (ticks[ticks.length - 1] !== total) ticks.push(total)
  const legend = bars[0]?.segments ?? []
  const summary = (b: Bar) => b.segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')

  return (
    <div className={styles.root} role="group" aria-label={`${title}, ${total} ${unit}`}>
      <ul className={styles.legend} aria-label="Legend">
        {legend.map((s) => <li key={s.key}><span className={`${styles.swatch} ${styles[s.tone]}`} aria-hidden="true" />{s.label}</li>)}
      </ul>

      {bars.map((b) => (
        <div key={b.id} className={styles.bar}>
          <div className={styles.label}><strong>{b.label}</strong>{b.detail && <span className={styles.detail}>{b.detail}</span>}</div>
          <div className={styles.plot}>
            <div className={styles.track} role="img" aria-label={`${b.label}: ${summary(b)} of ${total} ${unit}`}>
              {b.segments.filter((s) => s.value > 0).map((s) => (
                <span key={s.key} className={`${styles.seg} ${styles[s.tone]}`} style={{ width: `${(s.value / total) * 100}%` }}>{s.value}</span>
              ))}
            </div>
            <p className={styles.counts}>{b.segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(' · ')} <span className={styles.of}>of {total}</span></p>
          </div>
        </div>
      ))}

      <div className={`${styles.bar} ${styles.axisRow}`} aria-hidden="true">
        <div />
        <div className={styles.axis}>
          {ticks.map((t) => <span key={t} style={{ left: `${(t / total) * 100}%` }}>{t}</span>)}
          <span className={styles.axisTitle}>Number of {unit}</span>
        </div>
      </div>

      <table className={styles.srOnly}>
        <caption>{title}</caption>
        <thead><tr><th>Field</th>{legend.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{bars.map((b) => <tr key={b.id}><th>{b.label}</th>{b.segments.map((s) => <td key={s.key}>{s.value}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
