import { useEffect, useState } from 'react'
import { useMeta, type DatedPlanning } from '@pi/data'
import { Badge, Calendar, Card, ProvenanceChip } from '@pi/ui'
import styles from './PlanAgenda.module.css'

const cls = (name: string) => styles[name] ?? ''
const toDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1) }
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The planning estimates once they are anchored to a project completion date: a calendar with every milestone marked, next to the list of milestones with
 * where each date comes from. Dates are worked out in `datePlanningEstimates`; this card only shows them. A date the user did not give is labelled assumed.
 */
export default function EstimateTimelineCard({ timeline }: { timeline: DatedPlanning }) {
  const asOf = useMeta().data?.as_of_date
  const [active, setActive] = useState<string | null>(null)
  const first = timeline.milestones[0]
  const [month, setMonth] = useState<Date>(() => toDate(first?.date ?? timeline.completion))
  useEffect(() => { setActive(null); setMonth(toDate(first?.date ?? timeline.completion)) }, [first?.date, timeline.completion])
  if (!asOf) return <Card state="loading">{null}</Card>
  const marks = timeline.milestones.filter((m) => m.id !== 'completion').map((m) => toDate(m.date))
  const end = toDate(timeline.completion)
  return (
    <Card title="Planning timeline" aside={<ProvenanceChip kind="derived" detail={timeline.assumed ? 'completion date assumed' : 'from your completion date'} />}>
      <div className={styles.stack}>
        <p className={styles.sub}>
          Project completion <strong className="mono">{timeline.completion}</strong>
          {timeline.assumed && <> <Badge tone="medium">Assumed: 10 years from today</Badge></>}. The other dates are worked back from it with the median periods of similar projects. Click a milestone to find it on the calendar.
        </p>
        {timeline.overrun && <p role="alert"><Badge tone="high">Runs past completion</Badge> Procurement would finish after the project completion date. Choose a later completion date.</p>}
        <div className={`${styles.layout} ${styles.stacked}`}>
          <div className={styles.calendar}>
            <Calendar
              numberOfMonths={1}
              month={month}
              onMonthChange={setMonth}
              onDayClick={(day) => { const hit = timeline.milestones.find((m) => m.date === toIso(day)); if (hit) setActive(hit.id) }}
              modifiers={{ adv: marks, sign: end, active: active ? toDate(timeline.milestones.find((m) => m.id === active)?.date ?? timeline.completion) : [] }}
              modifiersClassNames={{ adv: cls('adv'), sign: cls('sign'), active: cls('active') }}
              className="[--cell-size:--spacing(9)]"
            />
          </div>
          <ol className={styles.agenda} aria-label="Milestones">
            {timeline.milestones.map((m, i) => (
              <li key={m.id}>
                <button type="button" className={`${styles.stage} ${active === m.id ? styles.stageOn : ''}`} aria-pressed={active === m.id} onClick={() => { setActive(m.id); setMonth(toDate(m.date)) }}>
                  <span className={`${styles.num} ${styles.num1}`}>{i + 1}</span>
                  <span>
                    <strong>{m.label}</strong> <span className={styles.date}>{m.date}</span>
                    <br /><span className={styles.sub}>{m.how}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        {timeline.notes.map((n) => <p key={n} className={styles.sub}>{n}</p>)}
      </div>
    </Card>
  )
}
