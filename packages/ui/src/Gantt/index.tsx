import { useState } from 'react'
import { Button } from '../Button'
import styles from './Gantt.module.css'

export type GanttTone = 'good' | 'attention' | 'bad' | 'neutral'

export interface GanttRow {
  id: string
  label: string
  /** Small text under the label, e.g. the group. */
  sublabel?: string
  /** Status in words, shown in the label column so colour is never the only signal. */
  statusText: string
  start: string
  end: string
  /** 0 to 100, or null when no progress is known (nothing is drawn). */
  progress: number | null
  milestone?: boolean
  tone: GanttTone
  ariaLabel: string
}

interface Props {
  rows: GanttRow[]
  rangeStart: string
  rangeEnd: string
  /** Vertical marker for today's date in the data. */
  asOf: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  legend: { tone: GanttTone; label: string }[]
  ariaLabel: string
  /** Rows shown before the chart scrolls; a Show all button reveals the rest. Leave out to always show every row. */
  visibleRows?: number
}

const ROW = 44, HEAD = 30
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/**
 * Horizontal bars on a month axis. Presentational: statuses and ranges are worked out before this.
 * Like a frozen spreadsheet: the label column and the month row stay in view while the rest scrolls both ways.
 */
export function Gantt({ rows, rangeStart, rangeEnd, asOf, selectedId, onSelect, legend, ariaLabel, visibleRows }: Props) {
  const [showAll, setShowAll] = useState(false)
  const limited = visibleRows !== undefined && rows.length > visibleRows && !showAll
  const maxHeight = limited ? HEAD + ROW * visibleRows + 2 : undefined
  const from = day(rangeStart)
  const span = Math.max(day(rangeEnd) - from, 1)
  const pct = (iso: string) => Math.max(0, Math.min(100, ((day(iso) - from) / span) * 100))

  const months: string[] = []
  for (let d = new Date(from); d.getTime() <= day(rangeEnd); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d.toISOString().slice(0, 10))
  const every = months.length > 16 ? 3 : months.length > 10 ? 2 : 1
  const ticks = months.filter((_, i) => i % every === 0)

  return (
    <div className={styles.root}>
      <ul className={styles.legend} aria-label="Legend">
        {legend.map((l) => <li key={l.label}><span className={`${styles.swatch} ${styles[l.tone]}`} aria-hidden="true" />{l.label}</li>)}
        <li><span className={styles.asOfSwatch} aria-hidden="true" />Date of the data</li>
        <li><span className={styles.diamondSwatch} aria-hidden="true" />Milestone</li>
      </ul>
      <div className={styles.scroll} style={maxHeight ? { maxHeight } : undefined} role="region" aria-label={`${ariaLabel}. Scroll up and down and sideways; the labels and months stay in view.`} tabIndex={0}>
        <div className={styles.chart} style={{ minWidth: Math.max(760, 210 + months.length * 56) }} role="group" aria-label={ariaLabel}>
          <div className={styles.labels}>
            <div className={styles.head} />
            {rows.map((r) => (
              <div key={r.id} title={r.label} className={`${styles.label} ${r.id === selectedId ? styles.selectedRow : ''}`}>
                <strong>{r.label}</strong>
                <span className={styles.sub}>{r.sublabel ? `${r.sublabel} · ` : ''}{r.statusText}</span>
              </div>
            ))}
          </div>
          <div className={styles.plot}>
            <div className={styles.head}>
              {ticks.map((t) => <span key={t} className={styles.tick} style={{ left: `${pct(t)}%` }}>{MONTH.format(new Date(day(t)))}</span>)}
              <span className={styles.asOfHead} style={{ left: `${pct(asOf)}%` }} aria-hidden="true">{asOf}</span>
            </div>
            {rows.map((r) => (
              <div key={r.id} className={`${styles.track} ${r.id === selectedId ? styles.selectedRow : ''}`}>
                {ticks.map((t) => <span key={t} className={styles.gridLine} style={{ left: `${pct(t)}%` }} aria-hidden="true" />)}
                {r.milestone ? (
                  <button type="button" className={`${styles.diamond} ${styles[r.tone]}`} style={{ left: `${pct(r.start)}%` }} aria-label={r.ariaLabel} aria-pressed={r.id === selectedId}
                    onClick={() => onSelect(r.id === selectedId ? null : r.id)} onMouseEnter={() => onSelect(r.id)} onFocus={() => onSelect(r.id)} />
                ) : (
                  <button type="button" className={`${styles.bar} ${styles[r.tone]}`} style={{ left: `${pct(r.start)}%`, width: `max(${pct(r.end) - pct(r.start)}%, 6px)` }} aria-label={r.ariaLabel} aria-pressed={r.id === selectedId}
                    onClick={() => onSelect(r.id === selectedId ? null : r.id)} onMouseEnter={() => onSelect(r.id)} onFocus={() => onSelect(r.id)}>
                    {r.progress !== null && <span className={styles.done} style={{ width: `${r.progress}%` }} />}
                  </button>
                )}
              </div>
            ))}
            <span className={styles.asOf} style={{ left: `${pct(asOf)}%` }} aria-hidden="true" />
          </div>
        </div>
      </div>
      {visibleRows !== undefined && rows.length > visibleRows && (
        <div className={styles.more}>
          <span>{limited ? `Showing ${visibleRows} of ${rows.length} items. Scroll the chart for the rest.` : `Showing all ${rows.length} items.`}</span>
          <Button onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{limited ? `Show all ${rows.length}` : 'Show fewer'}</Button>
        </div>
      )}
    </div>
  )
}
