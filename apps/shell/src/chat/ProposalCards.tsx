import { lazy, useState } from 'react'
import { z } from 'zod'
import { datePlanningEstimates, defaultCompletion, type Citation, type LifecycleStage, type NewLifecycleItem } from '@pi/data'
import { LIFECYCLE_STEPS } from '@pi/config'
import { Badge, Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { CitationChip, SourceDrawer } from '@pi/domain'
import { RemoteBoundary } from '../RemoteBoundary'
import { AddToLifecycle } from './MyLifecycle'
import styles from './ProposalCards.module.css'

const PlanProposalCard = lazy(() => import('planning/PlanProposalCard'))

const Missing = z.object({ missing: z.string() })
const PlanResult = z.object({
  plan: z.object({ name: z.string(), category: z.string(), method: z.string(), planned_advertisement: z.string(), planned_bid_opening: z.string(), planned_evaluation_complete: z.string(), planned_signing: z.string() }),
  basis: z.object({ sample_size: z.number(), projects: z.array(z.string()), median_total_days: z.number(), filtered_by: z.string() }),
  deadline_check: z.union([z.string(), z.object({ fits: z.boolean(), spare_days: z.number().optional(), days_over: z.number().optional() })]).optional(),
  data_kind: z.string().optional(),
  note: z.string().optional(),
})
const DraftResult = z.object({
  clauses: z.array(z.object({ field: z.string(), label: z.string(), unit: z.string(), value: z.union([z.number(), z.string()]), sample_size: z.number(), from: z.array(z.string()), source: z.enum(['real', 'mock']).optional(), basis: z.string().optional() })),
  lessons: z.array(z.object({ report: z.string(), project: z.string(), lesson: z.string(), chunk_id: z.string(), source: z.enum(['real', 'mock']).optional() })),
  filtered_by: z.string(),
  notes: z.array(z.string()).optional(),
})

const LifecycleResult = z.object({
  keyword: z.string().nullable(),
  groups: z.array(z.object({
    scope: z.enum(['real', 'mock']), label: z.string(), projects: z.array(z.string()), note: z.string().optional(),
    rows: z.array(z.object({
      stage: z.enum(['planning', 'tender-design', 'monitoring', 'learning']), metric: z.string(), value: z.union([z.number(), z.string()]).nullable(),
      unit: z.string(), n: z.number(), counts: z.string(), thin: z.boolean(), basis: z.string(), missing: z.string().optional(),
    })),
  })),
  how_to_read: z.string(),
})

const SuppliersResult = z.object({
  data_kind: z.string(), keyword: z.string().nullable(),
  projects: z.array(z.object({ id: z.string(), name: z.string(), country: z.string() })),
  supplier_count: z.number(),
  suppliers: z.array(z.object({ supplier_id: z.string(), name: z.string(), country: z.string(), contracts: z.number(), total_usd: z.number(), categories: z.array(z.string()), projects: z.array(z.string()) })),
  notes: z.array(z.string()),
})

/** A tool result arrives as text. Anything that is not the expected JSON shows as an empty state, never as a half-drawn card. */
function parse<T>(schema: z.ZodType<T>, result: string | undefined): { ok: true; data: T } | { ok: false; missing: string } {
  if (!result) return { ok: false, missing: 'The assistant sent no result.' }
  try {
    const json: unknown = JSON.parse(result)
    const gap = Missing.safeParse(json)
    if (gap.success) return { ok: false, missing: gap.data.missing }
    const parsed = schema.safeParse(json)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, missing: 'The assistant sent a result this app does not understand.' }
  } catch {
    return { ok: false, missing: 'The assistant sent a result this app does not understand.' }
  }
}

const Gap = ({ title, text }: { title: string; text: string }) => (
  <Card title={title} aside={<ProvenanceChip kind="missing" />}><EmptyState title="Nothing to suggest" text={text} /></Card>
)

/** The suggested plan for the user's own procurement, drawn with the Planning stage's timeline. */
export function PlanProposal({ result }: { result: string | undefined }) {
  const r = parse(PlanResult, result)
  if (!r.ok) return <Gap title="Suggested plan" text={r.missing} />
  const { plan, basis, deadline_check, note } = r.data
  const deadline = typeof deadline_check === 'object' ? deadline_check : undefined
  return (
    <div className={styles.card}>
      <RemoteBoundary name="Planning"><PlanProposalCard proposal={{ plan, basis, deadline }} /></RemoteBoundary>
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.add}>
        <AddToLifecycle item={{
          key: `plan:${plan.name}:${plan.planned_advertisement}`, stage: 'planning', kind: 'plan', title: plan.name || 'Suggested plan',
          summary: `Advertise ${plan.planned_advertisement}, open bids ${plan.planned_bid_opening}, finish evaluation ${plan.planned_evaluation_complete}, sign ${plan.planned_signing}.`,
          basis: `Median of ${basis.sample_size} stored ${basis.sample_size === 1 ? 'plan' : 'plans'} (${basis.filtered_by}); ${basis.median_total_days} days from advertisement to signing.`, detail: { plan, basis },
        }} />
      </div>
    </div>
  )
}

/** The suggested tender clauses, each with how it was worked out, and the lessons that go with them (citations open the shared evidence drawer). */
export function TenderProposal({ result }: { result: string | undefined }) {
  const [open, setOpen] = useState<Citation | null>(null)
  const r = parse(DraftResult, result)
  if (!r.ok) return <Gap title="Suggested tender draft" text={r.missing} />
  const { clauses, lessons, filtered_by, notes } = r.data
  return (
    <div className={styles.card}>
      <p className={styles.lead}><strong>Suggested tender draft</strong> ({filtered_by}). Each clause says where it comes from. Review every clause before using it.</p>
      <Card title="Clauses">
        <table className={styles.table}>
          <thead><tr><th scope="col">Clause</th><th scope="col">Suggested</th><th scope="col">Worked out from</th></tr></thead>
          <tbody>
            {clauses.map((c) => (
              <tr key={c.field}>
                <th scope="row">{c.label}</th>
                <td className={styles.value}>{typeof c.value === 'number' ? c.value.toLocaleString('en-US') : c.value}{c.unit ? ` ${c.unit}` : ''}</td>
                <td className={styles.basis}>
                  {c.source === 'mock' ? <Badge tone="medium">Demonstration</Badge> : c.source === 'real' ? <Badge tone="low">Real data</Badge> : null}{' '}
                  {c.basis ?? <>{c.field === 'evaluation_method' ? 'Most common' : 'Median'} of {c.sample_size} {c.sample_size === 1 ? 'draft' : 'drafts'}: <span className="mono">{c.from.join(', ')}</span></>}
                  <ProvenanceChip kind="derived" detail={`n=${c.sample_size}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {lessons.length > 0 && (
        <Card title="Lessons to apply" aside={lessons.every((l) => l.source === 'mock') ? <Badge tone="medium">Demonstration completion reports</Badge> : <ProvenanceChip kind="public" detail="completion reports" />}>
          <ul className={styles.lessons}>
            {lessons.map((l) => (
              <li key={l.chunk_id}>
                <span>{l.lesson}</span>
                <span className={styles.basis}>{l.project} · <CitationChip citation={{ ref_type: 'chunk', ref_id: l.chunk_id, label: l.chunk_id }} onOpen={setOpen} /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className={styles.add}>
        <AddToLifecycle item={{
          key: 'tender-clauses', stage: 'tender-design', kind: 'tender-clauses', title: 'Tender clauses',
          summary: clauses.map((c) => `${c.label}: ${typeof c.value === 'number' ? c.value.toLocaleString('en-US') : c.value}${c.unit ? ` ${c.unit}` : ''}`).join('; '),
          basis: `${clauses.filter((c) => c.source === 'real').length} clauses from real data, ${clauses.filter((c) => c.source !== 'real').length} from stored demonstration drafts (${filtered_by}).`, detail: { clauses, lessons },
        }} />
      </div>
      {(notes ?? []).map((n) => <p key={n} className={styles.note}>{n}</p>)}
      <p className={styles.note}>Demonstration figures are placeholders, not market benchmarks.</p>
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Planning figures are durations, which need a date to be drawn on a calendar. Ask for the project completion date; with none, it is ten years from
 * today and the other dates are worked back from it. The date is chosen before adding; adding again with another date replaces the earlier item.
 */
function PlanningAdd({ label, item }: { label: string; item: (completion?: string) => NewLifecycleItem }) {
  const [date, setDate] = useState('')
  return (
    <div className={styles.dateAsk}>
      <label>Project completion date
        <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} aria-describedby="completion-hint" />
      </label>
      <span id="completion-hint" className={styles.basis}>{date ? 'The other dates are worked back from it.' : `Leave empty to use ${defaultCompletion(today())}, 10 years from today.`}</span>
      <AddToLifecycle label={label} item={item(date || undefined)} />
    </div>
  )
}

const formatValue = (v: number | string, unit: string) => `${typeof v === 'number' ? v.toLocaleString('en-US') : v}${unit ? ` ${unit}` : ''}`

/**
 * The estimated lifecycle for the user's own procurement: per kind of data (real, mock), per stage, a median with what it rests on.
 * A row the data cannot fill says why. Nothing is blended across kinds, and a thin sample is flagged, not hidden.
 */
export function LifecycleProposal({ result }: { result: string | undefined }) {
  const r = parse(LifecycleResult, result)
  if (!r.ok) return <Gap title="Estimated lifecycle" text={r.missing} />
  const { groups, keyword, how_to_read } = r.data
  return (
    <div className={styles.card}>
      <p className={styles.lead}><strong>Estimated lifecycle</strong>{keyword ? <> for {keyword}</> : null}, from similar stored projects. These are suggestions for your team to review.</p>
      {groups.map((g) => (
        <Card key={g.scope} title={g.label} aside={<ProvenanceChip kind={g.scope === 'real' ? 'public' : 'derived'} detail={`${g.projects.length} ${g.projects.length === 1 ? 'project' : 'projects'}`} />}>
          {g.note && <p className={styles.note}>{g.note}</p>}
          {g.rows.length === 0 ? <EmptyState title="Nothing to estimate from" text="There are no projects of this kind." /> : (
            <div className={styles.scrollBox} tabIndex={0} role="region" aria-label="Estimated figures, scrollable">
            <table className={styles.table}>
              <thead><tr><th scope="col">Stage and figure</th><th scope="col">Estimate</th><th scope="col">Worked out from</th></tr></thead>
              <tbody>
                {g.rows.map((row) => (
                  <tr key={`${row.stage}-${row.metric}`}>
                    <th scope="row"><span className={styles.basis}>{LIFECYCLE_STEPS.find((s) => s.id === row.stage)?.label ?? row.stage}</span><br />{row.metric}</th>
                    {row.value === null
                      ? <td colSpan={2}><ProvenanceChip kind="missing" /> <span className={styles.basis}>{row.missing}</span></td>
                      : <>
                        <td className={styles.value}>{formatValue(row.value, row.unit)}</td>
                        <td className={styles.basis}>
                          <ProvenanceChip kind="derived" detail={`n=${row.n} ${row.counts}`} /> {row.thin && <Badge tone="medium">Thin sample</Badge>} {row.basis}
                        </td>
                      </>}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      ))}
      {groups.filter((g) => g.rows.some((x) => x.value !== null)).map((g) => (
        <Card key={`add-${g.scope}`} title={`Add to my lifecycle · ${g.scope === 'real' ? 'real projects' : 'mock projects'}`}>
          <div className={styles.add}>
            {LIFECYCLE_STEPS.flatMap((step) => {
              const rows = g.rows.filter((x) => x.stage === step.id && x.value !== null)
              if (rows.length === 0) return []
              const item = (completion?: string) => {
                const timeline = step.id === 'planning' ? datePlanningEstimates(rows, completion, today()) : undefined
                return {
                  key: `estimates:${g.scope}:${step.id}`, stage: step.id as LifecycleStage, kind: 'estimates' as const, title: `${step.label} estimates (${g.scope === 'real' ? 'real projects' : 'mock projects, illustrative'})`,
                  summary: rows.slice(0, 4).map((x) => `${x.metric}: ${typeof x.value === 'number' ? x.value.toLocaleString('en-US') : x.value}${x.unit ? ` ${x.unit}` : ''}`).join('; ') + (timeline ? `. Project completion ${timeline.completion}${timeline.assumed ? ' (assumed: 10 years from today)' : ''}.` : ''),
                  basis: `${g.label}; each figure is a median with n=${rows.map((x) => x.n).join(', ')} ${rows[0]!.counts}.`, detail: { scope: g.scope, rows, timeline },
                }
              }
              return [step.id === 'planning'
                ? <PlanningAdd key={step.id} label={`Add ${step.label.toLowerCase()} figures`} item={item} />
                : <AddToLifecycle key={step.id} label={`Add ${step.label.toLowerCase()} figures`} item={item()} />]
            })}
          </div>
        </Card>
      ))}
      <p className={styles.note}>{how_to_read}{groups.some((g) => g.scope === 'mock') ? ' Mock figures are demonstration data, not market benchmarks.' : ''}</p>
    </div>
  )
}

/**
 * Potential suppliers for the user's own procurement: who won contracts on the similar real projects, ranked by value. It says what the data cannot give
 * (contact details, who will bid), and the table keeps about five rows in view with the rest scrolling.
 */
export function PotentialSuppliers({ result }: { result: string | undefined }) {
  const r = parse(SuppliersResult, result)
  if (!r.ok) return <Gap title="Potential suppliers" text={r.missing} />
  const { suppliers, projects, supplier_count, notes, data_kind } = r.data
  return (
    <div className={styles.card}>
      <p className={styles.lead}><strong>Potential suppliers</strong> from {projects.length} similar {projects.length === 1 ? 'project' : 'projects'}: {projects.slice(0, 3).map((p) => p.name).join(', ')}{projects.length > 3 ? ` and ${projects.length - 3} more` : ''}.</p>
      <Card title={`${supplier_count} ${supplier_count === 1 ? 'supplier' : 'suppliers'} with contracts`} aside={<ProvenanceChip kind={data_kind.startsWith('real') ? 'public' : 'derived'} detail={data_kind.startsWith('real') ? 'contract awards' : 'mock'} />}>
        <div className={styles.scrollBox} tabIndex={0} role="region" aria-label="Potential suppliers, scrollable">
          <table className={`${styles.table} ${styles.labelled}`}>
            <thead><tr><th scope="col">Supplier</th><th scope="col">Country</th><th scope="col">Contracts</th><th scope="col">Value (USD)</th><th scope="col">Categories</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.supplier_id}>
                  <th scope="row">{s.name}<br /><span className={`mono ${styles.basis}`}>{s.supplier_id}</span></th>
                  <td data-label="Country">{s.country}</td>
                  <td className={styles.value} data-label="Contracts">{s.contracts}</td>
                  <td className={styles.value} data-label="Value (USD)">{s.total_usd.toLocaleString('en-US')}</td>
                  <td data-label="Categories">{s.categories.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {supplier_count > suppliers.length && <p className={styles.note}>The first {suppliers.length} of {supplier_count}, by value.</p>}
      </Card>
      {notes.map((n) => <p key={n} className={styles.note}>{n}</p>)}
    </div>
  )
}
