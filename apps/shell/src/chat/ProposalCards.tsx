import { lazy, useState } from 'react'
import { z } from 'zod'
import type { Citation } from '@pi/data'
import { LIFECYCLE_STEPS } from '@pi/config'
import { Badge, Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { CitationChip, SourceDrawer } from '@pi/domain'
import { RemoteBoundary } from '../RemoteBoundary'
import styles from './ProposalCards.module.css'

const PlanProposalCard = lazy(() => import('planning/PlanProposalCard'))

const Missing = z.object({ missing: z.string() })
const PlanResult = z.object({
  plan: z.object({ name: z.string(), category: z.string(), method: z.string(), planned_advertisement: z.string(), planned_bid_opening: z.string(), planned_evaluation_complete: z.string(), planned_signing: z.string() }),
  basis: z.object({ sample_size: z.number(), projects: z.array(z.string()), median_total_days: z.number(), filtered_by: z.string() }),
  deadline_check: z.union([z.string(), z.object({ fits: z.boolean(), spare_days: z.number().optional(), days_over: z.number().optional() })]).optional(),
})
const DraftResult = z.object({
  clauses: z.array(z.object({ field: z.string(), label: z.string(), unit: z.string(), value: z.union([z.number(), z.string()]), sample_size: z.number(), from: z.array(z.string()) })),
  lessons: z.array(z.object({ report: z.string(), project: z.string(), lesson: z.string(), chunk_id: z.string() })),
  filtered_by: z.string(),
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
  const { plan, basis, deadline_check } = r.data
  const deadline = typeof deadline_check === 'object' ? deadline_check : undefined
  return <RemoteBoundary name="Planning"><PlanProposalCard proposal={{ plan, basis, deadline }} /></RemoteBoundary>
}

/** The suggested tender clauses, each with how it was worked out, and the lessons that go with them (citations open the shared evidence drawer). */
export function TenderProposal({ result }: { result: string | undefined }) {
  const [open, setOpen] = useState<Citation | null>(null)
  const r = parse(DraftResult, result)
  if (!r.ok) return <Gap title="Suggested tender draft" text={r.missing} />
  const { clauses, lessons, filtered_by } = r.data
  return (
    <div className={styles.card}>
      <p className={styles.lead}><strong>Suggested tender draft</strong> from the stored drafts ({filtered_by}). Review every clause before using it. <ProvenanceChip kind="derived" detail={`n=${clauses[0]?.sample_size ?? 0}`} /></p>
      <Card title="Clauses">
        <table className={styles.table}>
          <thead><tr><th scope="col">Clause</th><th scope="col">Suggested</th><th scope="col">Worked out from</th></tr></thead>
          <tbody>
            {clauses.map((c) => (
              <tr key={c.field}>
                <th scope="row">{c.label}</th>
                <td className={styles.value}>{typeof c.value === 'number' ? c.value.toLocaleString('en-US') : c.value}{c.unit ? ` ${c.unit}` : ''}</td>
                <td className={styles.basis}>{c.field === 'evaluation_method' ? 'Most common' : 'Median'} of {c.sample_size} {c.sample_size === 1 ? 'draft' : 'drafts'}: <span className="mono">{c.from.join(', ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {lessons.length > 0 && (
        <Card title="Lessons to apply" aside={<ProvenanceChip kind="public" detail="completion reports" />}>
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
      <p className={styles.note}>Mock projects are demonstration data, so these are reference values, not market benchmarks.</p>
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
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
          )}
        </Card>
      ))}
      <p className={styles.note}>{how_to_read} Mock figures are demonstration data, not market benchmarks.</p>
    </div>
  )
}
