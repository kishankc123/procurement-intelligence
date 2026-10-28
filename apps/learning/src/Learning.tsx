import { useState } from 'react'
import { THRESHOLDS, can, whyDisabled } from '@pi/config'
import {
  dataReadiness, feedbackKpis, useAuditLog, useContracts, useCurrentUser, useEnrichments, useFeedback, useRecommendations, useReviewFeedback, useUiStore,
  tenderCoverage,
} from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip, StackedBars } from '@pi/ui'
import styles from './Learning.module.css'

const STATUS_TONE = { new: 'medium', accepted: 'low', rejected: 'high', edited: 'neutral' } as const

// Proposed plan only: nothing here is built or measured.
const ROADMAP = [
  { phase: 'Next', item: 'Retrain duration model once 30 completed projects with key dates are ingested' },
  { phase: 'Next', item: 'Re-rank recommendations using reviewer-accepted feedback' },
  { phase: 'Later', item: 'Active learning: ask reviewers about the least certain links first' },
]

export default function Learning() {
  const { projectId, fiscalYear } = useUiStore()
  const { role } = useCurrentUser()
  const feedback = useFeedback()
  const recs = useRecommendations(projectId).data ?? []
  const audit = useAuditLog().data ?? []
  const contractsQuery = useContracts(projectId)
  const contracts = contractsQuery.data ?? []
  const enrichmentsQuery = useEnrichments()
  const enrichments = enrichmentsQuery.data ?? []
  const review = useReviewFeedback()
  const [editing, setEditing] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  if (feedback.isLoading) return <Card state="loading">{null}</Card>
  if (feedback.isError) return <Card state="error">{null}</Card>

  const rows = feedback.data ?? []
  const kpis = feedbackKpis(rows)
  const allowed = can(role, 'review_feedback')
  const reason_ = allowed ? undefined : whyDisabled('review_feedback')
  const fiscalYears = [...new Set(contracts.map((c) => c.fiscal_year))].filter((fy) => fy === fiscalYear)
  // Same population as the coverage table below: this project's contracts in the selected fiscal year.
  const inYear = contracts.filter((c) => c.fiscal_year === fiscalYear)
  const readiness = dataReadiness(inYear, enrichments)
  const readinessState = contractsQuery.isError || enrichmentsQuery.isError ? 'error' : contractsQuery.isLoading || enrichmentsQuery.isLoading ? 'loading' : 'ready'
  const titleOf = (id: string) => recs.find((r) => r.id === id)?.title ?? id

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Learning</h1>
        <p>Feedback from planners and reviewers, and what changed because of it. Every figure is derived from the feedback and audit logs.</p>
      </div>

      <div className={styles.kpis}>
        <Card title="Feedback received">
          {kpis ? <><p><span className={styles.big}>{kpis.total}</span></p><ProvenanceChip kind="derived" detail={`n=${kpis.total}`} /></>
            : <EmptyState title="No feedback yet" text="Use Helpful or Not helpful on a recommendation in Planning." />}
        </Card>
        <Card title="Feedback accepted by reviewers">
          {kpis && kpis.reviewed > 0 ? (
            <><p><span className={styles.big}>{kpis.accepted}</span> <span className={styles.unit}>of {kpis.reviewed} reviewed</span></p>
              <p className={styles.sub}>{kpis.rejected} rejected</p><ProvenanceChip kind="derived" detail={`n=${kpis.reviewed}`} /></>
          ) : <EmptyState title="Nothing reviewed yet" text="Accept, edit or reject items in the queue below." />}
        </Card>
      </div>

      <Card title="Feedback queue" aside={<span className={styles.sub}>Reviewer decides</span>}>
        {rows.length === 0 ? <EmptyState title="Queue is empty" /> : (
          <table className={styles.table}>
            <thead><tr><th>Recommendation</th><th>Rating</th><th>From</th><th>Status</th><th>Decision</th></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{titleOf(f.target_id)}<br /><span className="mono">{f.target_id}</span>{f.reason && <p className={styles.sub}>Note: {f.reason}</p>}</td>
                  <td>{f.rating === 'helpful' ? 'Helpful' : 'Not helpful'}</td>
                  <td>{f.role.replace('_', ' ')}</td>
                  <td><Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge></td>
                  <td className={styles.actions}>
                    <Button onClick={() => review.mutate({ id: f.id, status: 'accepted' })} disabledReason={reason_}>Accept</Button>
                    {editing === f.id ? (
                      <>
                        <input aria-label="Edit note" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Edited note" />
                        <Button onClick={() => { review.mutate({ id: f.id, status: 'edited', reason }); setEditing(null); setReason('') }} disabled={!reason}>Save edit</Button>
                      </>
                    ) : <Button onClick={() => { setEditing(f.id); setReason(f.reason) }} disabledReason={reason_}>Edit</Button>}
                    <Button onClick={() => review.mutate({ id: f.id, status: 'rejected' })} disabledReason={reason_}>Reject</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Contract data readiness" aside={<ProvenanceChip kind="derived" detail={`n=${readiness.eligible}`} />} state={readinessState}>
        {readiness.eligible === 0 ? <EmptyState title={`No contracts in FY${fiscalYear}`} text="Change the fiscal year in the top bar." /> : (
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
          {fiscalYears.length === 0 ? <EmptyState title={`No contracts in FY${fiscalYear}`} text="Change the fiscal year in the top bar." /> : (
            <table className={styles.table}>
              <thead><tr><th>Fiscal year</th><th>Contracts with approved entered data</th></tr></thead>
              <tbody>{fiscalYears.map((fy) => {
                const { covered, total } = tenderCoverage(contracts.filter((c) => c.fiscal_year === fy), enrichments)
                return <tr key={fy}><td>FY{fy}</td><td className="mono">{covered} of {total}</td></tr>
              })}</tbody>
            </table>
          )}
          <p className={styles.sub}>Benchmarks unlock at {THRESHOLDS.tenderBenchmarkMinContracts} contracts with the field entered.</p>
        </Card>

        <Card title="Update log" aside={<span className={styles.sub}>from audit log</span>}>
          {audit.length === 0 ? <EmptyState title="No updates yet" text="Every save, approval and decision is logged here." /> : (
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Role</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>{[...audit].reverse().slice(0, 10).map((a) => (
                <tr key={a.id}><td className="mono">{a.at.slice(0, 19).replace('T', ' ')}</td><td>{a.role.replace('_', ' ')}</td><td>{a.action}</td><td className="mono">{a.target}</td></tr>
              ))}</tbody>
            </table>
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
