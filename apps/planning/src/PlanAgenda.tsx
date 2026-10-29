import { useEffect, useState } from 'react'
import { planStages, type Plan, type PlanStage, type StageId } from '@pi/data'
import { Badge, Calendar, Card, EmptyState, ProvenanceChip, Select } from '@pi/ui'
import styles from './PlanAgenda.module.css'

// CSS module lookups can be undefined for the type checker; this keeps class names plain strings.
const cls = (name: string) => styles[name] ?? ''
const NUM_CLASS: Record<StageId, string> = { advertisement: cls('num1'), bid_opening: cls('num2'), evaluation_complete: cls('num3'), contract_signing: cls('num4') }

const toDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1) }
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const relative = (n: number) => (n === 0 ? 'on the data date' : n > 0 ? `in ${plural(n, 'day')}` : `${plural(-n, 'day')} ago`)
const weekday = (iso: string) => toDate(iso).toLocaleDateString('en-GB', { weekday: 'short' })

/** Two months side by side on wide screens, one on narrow ones. */
function useWide(query = '(min-width: 1000px)') {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return wide
}

/**
 * Plan timeline at the top of Planning (`compact` stacks it and shows one month, for the chat): a calendar with the four tender stages marked, next to an agenda that lists
 * them with the days between. Click a stage in either place to highlight it in the other. Dates come from the saved plan.
 */
export function PlanAgenda({ plans, asOf, compact, title = 'Plan timeline', provenance = 'entered' }: { plans: Plan[]; asOf: string; compact?: boolean; title?: string; provenance?: 'entered' | 'derived' }) {
  const [planId, setPlanId] = useState<string | null>(null)
  const [active, setActive] = useState<StageId | null>(null)
  const plan = plans.find((p) => p.id === planId) ?? plans[0]
  const [month, setMonth] = useState<Date>(() => toDate(plan?.planned_advertisement ?? asOf))
  const wide = useWide() && !compact

  // Show the first stage's month whenever another plan is chosen.
  useEffect(() => { if (plan) { setMonth(toDate(plan.planned_advertisement)); setActive(null) } }, [plan?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) {
    return <Card title="Plan timeline"><EmptyState title="No plans yet" text="Plans for this project are entered in Planning." /></Card>
  }

  const { stages, totalDays, outOfOrder } = planStages(plan, asOf)
  const byId = (id: StageId) => stages.find((s) => s.id === id) as PlanStage
  const [adv, bid, evalc, sign] = [byId('advertisement'), byId('bid_opening'), byId('evaluation_complete'), byId('contract_signing')]
  const pick = (s: PlanStage) => { setActive(s.id); setMonth(toDate(s.date)) }
  const gaps = stages.filter((s) => s.daysSincePrevious !== null && s.daysSincePrevious > 0)

  return (
    <Card title={title} aside={<ProvenanceChip kind={provenance} />}>
      <div className={styles.stack}>
        {plans.length > 1 && (
          <div style={{ maxWidth: 420 }}>
            <Select aria-label="Plan to show" value={plan.id} onValueChange={setPlanId} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
          </div>
        )}
        <p className={styles.sub}>
          <strong>{plan.name}</strong> · {plan.category} · {plan.method}. Click a stage in the list or on the calendar. The data date is <span className="mono">{asOf}</span>.
        </p>

        <div className={`${styles.layout} ${compact ? styles.stacked : ''}`}>
          <div className={styles.calendar}>
            <Calendar
              numberOfMonths={wide ? 2 : 1}
              month={month}
              onMonthChange={setMonth}
              onDayClick={(day) => { const hit = stages.find((s) => s.date === toIso(day)); if (hit) pick(hit) }}
              modifiers={{
                adv: toDate(adv.date), bid: toDate(bid.date), evalc: toDate(evalc.date), sign: toDate(sign.date),
                between: outOfOrder ? [] : { from: toDate(adv.date), to: toDate(sign.date) },
                asof: toDate(asOf),
                active: active ? toDate(byId(active).date) : [],
              }}
              modifiersClassNames={{
                adv: cls('adv'), bid: cls('bid'), evalc: cls('evalc'), sign: cls('sign'),
                between: cls('between'), asof: cls('asof'), active: cls('active'),
              }}
              className="[--cell-size:--spacing(9)]"
            />
          </div>

          <div className={styles.stack}>
            {outOfOrder ? (
              <p role="alert"><Badge tone="high">Dates out of order</Badge> A stage is dated before the one before it. Fix the dates in the plan below.</p>
            ) : (
              <div className={styles.bar} role="img" aria-label={`Advertisement to signing in ${plural(totalDays, 'day')}: ${gaps.map((g) => `${plural(g.daysSincePrevious ?? 0, 'day')} to ${g.label.toLowerCase()}`).join(', ')}`}>
                {gaps.map((g, i) => (
                  <span key={g.id} className={`${styles.seg} ${styles[`seg${i + 1}`]}`} style={{ width: `${((g.daysSincePrevious ?? 0) / Math.max(totalDays, 1)) * 100}%` }}>{g.daysSincePrevious}d</span>
                ))}
              </div>
            )}

            <ol className={styles.agenda} aria-label="Plan stages">
              {stages.map((s, i) => (
                <li key={s.id}>
                  {s.daysSincePrevious !== null && (
                    <p className={styles.gap}>{s.daysSincePrevious >= 0 ? `${plural(s.daysSincePrevious, 'day')} later` : `${plural(-s.daysSincePrevious, 'day')} before the previous stage`}</p>
                  )}
                  <button type="button" className={`${styles.stage} ${active === s.id ? styles.stageOn : ''}`} aria-pressed={active === s.id} onClick={() => pick(s)}>
                    <span className={`${styles.num} ${NUM_CLASS[s.id]}`}>{i + 1}</span>
                    <span>
                      <strong>{s.label}</strong>{' '}
                      <span className={styles.date}>{weekday(s.date)} {s.date}</span>
                      <br /><span className={styles.sub}>{relative(s.daysFromAsOf)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <p className={styles.total}>
              <strong>{plural(totalDays, 'day')}</strong> from advertisement to contract signing. <ProvenanceChip kind="derived" detail="from your plan" />
            </p>
            <div className={styles.legend}>
              <span><span className={styles.asofSwatch} aria-hidden="true" />Data date</span>
              <span>Shaded days are between advertisement and signing.</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
