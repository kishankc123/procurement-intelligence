import { useState, type ReactNode } from 'react'
import { THRESHOLDS, can, whyDisabled } from '@pi/config'
import {
  dataReadiness, feedbackKpis, useAuditLog, useContracts, useCurrentUser, useEnrichments, useFeedback, type Feedback, useRecommendations, useReviewFeedback, useUiStore,
  tenderCoverage,
} from '@pi/data'
import { Badge, Button, Card, Check, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, Pencil, ProvenanceChip, StackedBars, TableScroll, Paged, Carousel, X } from '@pi/ui'
import styles from './Learning.module.css'

const STATUS_TONE = { new: 'medium', accepted: 'low', rejected: 'high', edited: 'neutral' } as const

// Proposed plan only: nothing here is built or measured.
const ROADMAP = [
  { phase: 'Next', item: 'Retrain duration model once 30 completed projects with key dates are ingested' },
  { phase: 'Next', item: 'Re-rank recommendations using reviewer-accepted feedback' },
  { phase: 'Later', item: 'Active learning: ask reviewers about the least certain links first' },
]

/** What a feedback target is, in words: a recommendation's title, or the layer or chat card the feedback was given on. */
function useFeedbackTitles(projectId: string) {
  const recs = useRecommendations(projectId).data ?? []
  const LAYER = { link: 'Work with AI · source link', ingestion: 'Work with AI · ingestion', records: 'Work with AI · record linking', schedule: 'Schedule', retender: 'Work with AI · retender check', spec: 'Tender design · specification checks', supplier: 'Suppliers · profile', chatready: 'Chat · ready summary', chatlifecycle: 'Chat · lifecycle', chatplanning: 'Chat · Planning card', chattender: 'Chat · tender draft', chatmonitoring: 'Chat · Monitoring cards', chatlearning: 'Chat · Learning card', chatsuppliers: 'Chat · Suppliers card', chatprojectdata: 'Chat · Contracts card', chatknowledge: 'Chat · Knowledge base card', chatevidence: 'Chat · Evidence workbench card' } as const
  return (id: string) => recs.find((r) => r.id === id)?.title ?? LAYER[id.split('-')[2] as keyof typeof LAYER] ?? id
}

/** The two feedback figures. An array of keyed cards, so a carousel (page) or a grid (chat) can hold them. */
export function feedbackFigures(kpis: ReturnType<typeof feedbackKpis>): ReactNode[] {
  return [
        <Card key="received" title="Feedback received">
          {kpis ? <><p><span className={styles.big}>{kpis.total}</span></p><ProvenanceChip kind="derived" detail={`n=${kpis.total}`} /></>
            : <EmptyState title="No feedback yet" text="Use Helpful or Not helpful on a recommendation in Planning." />}
        </Card>,
        <Card key="accepted" title="Feedback accepted by reviewers">
          {kpis && kpis.reviewed > 0 ? (
            <><p><span className={styles.big}>{kpis.accepted}</span> <span className={styles.unit}>of {kpis.reviewed} reviewed</span></p>
              <p className={styles.sub}>{kpis.rejected} rejected</p><ProvenanceChip kind="derived" detail={`n=${kpis.reviewed}`} /></>
          ) : <EmptyState title="Nothing reviewed yet" text="Accept, edit or reject items in the queue below." />}
        </Card>,
  ]
}

/** The feedback queue with Accept, Reject and an Edit modal. Reviewers decide; everyone else sees it read-only with the reason. */
export function FeedbackQueueCard({ projectId, only }: { projectId: string; only?: (f: Feedback) => boolean }) {
  const { role } = useCurrentUser()
  const feedback = useFeedback()
  const review = useReviewFeedback()
  const titleOf = useFeedbackTitles(projectId)
  const [editing, setEditing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const rows = (feedback.data ?? []).filter((f) => !only || only(f))
  const editingItem = rows.find((f) => f.id === editing)
  const allowed = can(role, 'review_feedback')
  const reason_ = allowed ? undefined : whyDisabled('review_feedback')
  if (feedback.isLoading) return <Card state="loading">{null}</Card>
  if (feedback.isError) return <Card state="error">{null}</Card>
  return (
    <>
      <Card title="Feedback queue" aside={<span className={styles.sub}>Reviewer decides</span>}>
        {rows.length === 0 ? <EmptyState title="Queue is empty" /> : (
          <Paged items={rows} label="feedback items" maxHeight="520px">{(pageRows) =><table className={`${styles.table} ${styles.queue}`}>
            <thead><tr><th>Recommendation</th><th>Rating</th><th>From</th><th>Status</th><th>Decision</th><th>Edit</th></tr></thead>
            <tbody>
              {pageRows.map((f) => (
                <tr key={f.id}>
                  <td>{titleOf(f.target_id)}<br /><span className="mono">{f.target_id}</span>{f.reason && <p className={styles.sub}>Note: {f.reason}</p>}</td>
                  <td data-label="Rating">{f.rating === 'helpful' ? 'Helpful' : 'Not helpful'}</td>
                  <td data-label="From">{f.role.replace('_', ' ')}</td>
                  <td data-label="Status"><Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge></td>
                  <td>
                    <div className={styles.actions}><Button variant="success" onClick={() => review.mutate({ id: f.id, status: 'accepted' })} disabledReason={reason_}><Check size={16} aria-hidden="true" />Accept</Button>
                    <Button variant="danger" onClick={() => review.mutate({ id: f.id, status: 'rejected' })} disabledReason={reason_}><X size={16} aria-hidden="true" />Reject</Button></div>
                  </td>
                  <td>
                    <Button variant="primary" onClick={() => { setEditing(f.id); setReason(f.reason) }} disabledReason={reason_}><Pencil size={16} aria-hidden="true" />Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}</Paged>
        )}
      </Card>

      <Dialog open={editingItem !== undefined} onOpenChange={(o) => { if (!o) { setEditing(null); setReason('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit feedback note</DialogTitle>
            <DialogDescription>{editingItem ? `${titleOf(editingItem.target_id)} (${editingItem.target_id})` : ''}. Saving marks it as edited.</DialogDescription>
          </DialogHeader>
          <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); if (editingItem) review.mutate({ id: editingItem.id, status: 'edited', reason }, { onSuccess: () => { setEditing(null); setReason('') } }) }}>
            <label>Note
              <textarea aria-label="Edited note" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Edited note" />
            </label>
            <div className={styles.actions}>
              <Button type="submit" variant="success" disabled={!reason || review.isPending}><Check size={16} aria-hidden="true" />Save edit</Button>
              <Button type="button" onClick={() => { setEditing(null); setReason('') }}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function Learning() {
  const { projectId, fiscalYear } = useUiStore()
  const feedback = useFeedback()
  const audit = useAuditLog().data ?? []
  const contractsQuery = useContracts(projectId)
  const contracts = contractsQuery.data ?? []
  const enrichmentsQuery = useEnrichments()
  const enrichments = enrichmentsQuery.data ?? []

  if (feedback.isLoading) return <Card state="loading">{null}</Card>
  if (feedback.isError) return <Card state="error">{null}</Card>

  const rows = feedback.data ?? []
  const kpis = feedbackKpis(rows)
  const fiscalYears = [...new Set(contracts.map((c) => c.fiscal_year))].filter((fy) => fy === fiscalYear)
  // Same population as the coverage table below: this project's contracts in the selected fiscal year.
  const inYear = contracts.filter((c) => c.fiscal_year === fiscalYear)
  const readiness = dataReadiness(inYear, enrichments)
  const readinessState = contractsQuery.isError || enrichmentsQuery.isError ? 'error' : contractsQuery.isLoading || enrichmentsQuery.isLoading ? 'loading' : 'ready'

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Learning</h1>
        <p>Feedback from planners and reviewers, and what changed because of it. Every figure is derived from the feedback and audit logs.</p>
      </div>

      <Carousel ariaLabel="Feedback figures">{feedbackFigures(kpis)}</Carousel>

      <FeedbackQueueCard projectId={projectId} />

      <Card title="Contract data readiness" aside={<ProvenanceChip kind="derived" detail={`n=${readiness.eligible}`} />} state={readinessState}>
        {readiness.eligible === 0 ? <EmptyState title={`No contracts in FY${fiscalYear}`} text="Change the fiscal year in the filters on the left." /> : (
          <div className={styles.stack}>
            <p className={styles.sub}>
              {readiness.eligible} contracts in FY{fiscalYear}. Each bar shows how many have a usable value for a field that Tender design or Monitoring reads.
              This is data-entry status only, not risk or performance.
            </p>
            <StackedBars
              title="Contract data readiness"
              total={readiness.eligible}
              unit="contracts"
              bars={readiness.rows.map((r) => ({
                id: r.field, label: r.label, detail: `Used by: ${r.usedBy}`,
                segments: [
                  { key: 'usable', label: 'Usable', value: r.usable, tone: 'good' },
                  { key: 'pending', label: 'Pending review', value: r.pending, tone: 'pending' },
                  { key: 'invalid', label: 'Not usable', value: r.invalid, tone: 'bad' },
                  { key: 'missing', label: 'Missing', value: r.missing, tone: 'missing' },
                ],
              }))}
            />
            <p className={styles.sub}>
              Usable means the latest approved entry passes the rule the comparison uses (bid validity above 0 days; an end date after the signing date).
              Not usable is an approved entry that fails that rule. Pending entries are not counted as usable. The coverage table below counts a contract once any field has an approved entry, so its total can be higher than these bars.
            </p>
          </div>
        )}
      </Card>

      <div className={styles.two}>
        <Card title="Data coverage by fiscal year" aside={<ProvenanceChip kind="derived" />}>
          {fiscalYears.length === 0 ? <EmptyState title={`No contracts in FY${fiscalYear}`} text="Change the fiscal year in the filters on the left." /> : (
            <TableScroll><table className={styles.table}>
              <thead><tr><th>Fiscal year</th><th>Contracts with approved entered data</th></tr></thead>
              <tbody>{fiscalYears.map((fy) => {
                const { covered, total } = tenderCoverage(contracts.filter((c) => c.fiscal_year === fy), enrichments)
                return <tr key={fy}><td>FY{fy}</td><td className="mono">{covered} of {total}</td></tr>
              })}</tbody>
            </table></TableScroll>
          )}
          <p className={styles.sub}>Benchmarks unlock at {THRESHOLDS.tenderBenchmarkMinContracts} contracts with the field entered.</p>
        </Card>

        <Card title="Update log" aside={<span className={styles.sub}>from audit log</span>}>
          {audit.length === 0 ? <EmptyState title="No updates yet" text="Every save, approval and decision is logged here." /> : (
            <Paged items={[...audit].reverse()} label="updates" maxHeight="520px">{(pageRows) =><table className={styles.table}>
              <thead><tr><th>When</th><th>Role</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>{pageRows.slice(0, 10).map((a) => (
                <tr key={a.id}><td className="mono">{a.at.slice(0, 19).replace('T', ' ')}</td><td>{a.role.replace('_', ' ')}</td><td>{a.action}</td><td className="mono">{a.target}</td></tr>
              ))}</tbody>
            </table>}</Paged>
          )}
        </Card>
      </div>

      <Card title="Roadmap" aside={<Badge>Proposed plan</Badge>}>
        <ul>{ROADMAP.map((r) => <li key={r.item}><strong>{r.phase}:</strong> {r.item}</li>)}</ul>
        <p className={styles.sub}>Not built and not measured. Shown for discussion.</p>
      </Card>
    </div>
  )
}
