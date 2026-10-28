import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { can, whyDisabled } from '@pi/config'
import {
  countryReference, glanceGaps, glanceRows, plannedDurations, specificationChecks, tenderCandidates, tenderComparison, useAllPlans, useChunks, useContracts, useCountryYears, useDocs, useProject, useTenderHistory, useCurrentUser, useEnrichments, usePlan, useSaveTenderDraft, useDeleteTenderDraft, useTenderDraft, useUiStore,
  type Citation, type GlanceRow, type Plan, type TenderDraft,
} from '@pi/data'
import { Button, Card, ConfirmDeleteDialog, DeleteButton, EmptyState, PairedBars, ProvenanceChip, Select, TableScroll } from '@pi/ui'
import { CitationChip, FeedbackWidget, SourceDrawer } from '@pi/domain'
import { SpecGroups } from './SpecGroups'
import { ValidityCoverage } from './ValidityCoverage'
import styles from './ProjectData.module.css'

const METHODS = ['Lowest evaluated price', 'Quality and cost based', 'Fixed budget']

type NumKey = 'duration_months' | 'bid_validity_days' | 'performance_security_pct' | 'min_similar_contracts' | 'min_similar_value_usd'

/** The plan the draft is compared with: just its name until opened, then its details. */
function PlanReference({ plans, plan, onPick }: { plans: Plan[]; plan: Plan | undefined; onPick: (id: string) => void }) {
  if (!plan) return <p className={styles.sub}>No plan to compare with. <Link to="/planning">Add one in Planning</Link>.</p>
  const d = plannedDurations(plan)
  return (
    <details className={styles.planRef}>
      <summary><span>Compared with plan: <strong>{plan.name}</strong> <span className="mono">{plan.id}</span></span></summary>
      <div className={styles.scroll}>
        <TableScroll><table className={styles.table}>
          <thead><tr><th>Category</th><th>Method</th><th>Advertisement</th><th>Bid opening</th><th>Evaluation complete</th><th>Signing</th><th>Bid opening to signing</th></tr></thead>
          <tbody><tr>
            <td>{plan.category}</td><td>{plan.method}</td>
            <td className="mono">{plan.planned_advertisement}</td><td className="mono">{plan.planned_bid_opening}</td>
            <td className="mono">{plan.planned_evaluation_complete}</td><td className="mono">{plan.planned_signing}</td>
            <td className="mono">{d.bidOpeningToSigning} days <ProvenanceChip kind="derived" /></td>
          </tr></tbody>
        </table></TableScroll>
      </div>
      {plans.length > 1 && (
        <label className={styles.planPick}>Compare with another plan
          <Select value={plan.id} onValueChange={onPick} options={plans.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))} />
        </label>
      )}
    </details>
  )
}

/** Content of the info icon next to a result: what it means, how the reference was worked out, and the evidence. */
function WhatItMeans({ row, onCite }: { row: GlanceRow; onCite: (c: Citation) => void }) {
  return (
    <>
      <strong>What it means</strong>
      <span>{row.meaning}</span>
      <span className={styles.sub}>How the reference was worked out: {row.basis}</span>
      {row.citations.length > 0 && <span>{row.citations.map((c) => <span key={c.ref_id}><CitationChip citation={c} onOpen={onCite} />{' '}</span>)}</span>}
    </>
  )
}

export function TenderDesign() {
  const { projectId, fiscalYear } = useUiStore()
  const { role } = useCurrentUser()
  const storedQuery = useTenderDraft(projectId)
  const stored = storedQuery.data?.[0]
  const plans = usePlan(projectId).data ?? []
  const [planId, setPlanId] = useState<string | null>(null)
  const plan = plans.find((p) => p.id === planId) ?? plans[0]
  const contracts = useContracts(projectId, fiscalYear).data ?? []
  const enrichments = useEnrichments().data ?? []
  const save = useSaveTenderDraft()
  const remove = useDeleteTenderDraft()
  const [confirming, setConfirming] = useState(false)
  const project = useProject(projectId).data?.[0]
  const history = useTenderHistory().data ?? []
  const allPlans = useAllPlans().data ?? []
  const docs = useDocs().data ?? []
  const chunks = useChunks().data ?? []
  const years = useCountryYears(project?.borrower_country_code ?? '').data ?? []
  const [draft, setDraft] = useState<TenderDraft | undefined>(stored)
  const [open, setOpen] = useState<Citation | null>(null)
  useEffect(() => setDraft(stored), [stored])

  if (storedQuery.isSuccess && !stored) {
    return (
      <Card title="Draft clauses" aside={<ProvenanceChip kind="missing" />}>
        <EmptyState title="No tender draft for this project yet" text="Tender clauses are entered by a planner once a draft exists. Nothing is estimated in the meantime." />
      </Card>
    )
  }
  if (!draft || !stored) return <Card state="loading">{null}</Card>
  const allowed = can(role, 'edit_tender_draft')
  const changed = (k: keyof TenderDraft) => draft[k] !== stored[k]
  const unsaved = (['duration_months', 'bid_validity_days', 'performance_security_pct', 'min_similar_contracts', 'min_similar_value_usd', 'evaluation_method'] as const).filter(changed).length
  const num = (k: NumKey, label: string) => (
    <label>{label}
      <input type="number" min={0} value={draft[k]} disabled={!allowed} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
      {changed(k) && <span className={styles.changed}>Saved: <span className="mono">{stored[k].toLocaleString('en-US')}</span> → now <span className="mono">{draft[k].toLocaleString('en-US')}</span></span>}
    </label>
  )
  // The comparison reflects the unsaved draft, so every edit shows its effect straight away.
  const rows = tenderComparison(draft, plan, contracts, enrichments)
  const checks = project
    ? specificationChecks({
      draft, plan, project, contracts, candidates: tenderCandidates(history, allPlans), docs, chunks,
      evaluationReference: countryReference(years, project.borrower_country_code, 'C5.2'),
    })
    : []
  const glance = glanceRows(rows, checks)
  const gaps = glanceGaps(rows)

  return (
    <div className={styles.page}>
      <div><h1>Tender design</h1><p className={styles.sub}>Draft the clauses, then see each one against your plan and your contract data.</p></div>

      <Card title="Draft clauses" aside={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ProvenanceChip kind="entered" /><DeleteButton onClick={() => setConfirming(true)} disabledReason={allowed ? undefined : whyDisabled('edit_tender_draft')} /></span>}>
        <PlanReference plans={plans} plan={plan} onPick={setPlanId} />
        <form className={styles.clauses} onSubmit={(e) => { e.preventDefault(); save.mutate(draft) }}>
          {num('duration_months', 'Contract duration (months)')}
          {num('bid_validity_days', 'Bid validity (days)')}
          {num('performance_security_pct', 'Performance security (%)')}
          {num('min_similar_contracts', 'Minimum similar contracts')}
          {num('min_similar_value_usd', 'Minimum similar contract value (USD)')}
          <label>Evaluation method
            <Select value={draft.evaluation_method} disabled={!allowed} onValueChange={(v) => setDraft({ ...draft, evaluation_method: v })} options={METHODS.map((m) => ({ value: m, label: m }))} />
            {changed('evaluation_method') && <span className={styles.changed}>Saved: {stored.evaluation_method} → now {draft.evaluation_method}</span>}
          </label>
          <div className={styles.actions}>
            <Button type="submit" variant="success" disabled={unsaved === 0 || save.isPending} disabledReason={allowed ? undefined : whyDisabled('edit_tender_draft')}>Save draft</Button>
            <Button type="button" disabled={unsaved === 0} onClick={() => setDraft(stored)}>Discard changes</Button>
            <span role="status" className={styles.sub}>{unsaved > 0 ? `${unsaved} unsaved ${unsaved === 1 ? 'change' : 'changes'}` : save.isSuccess ? 'Saved.' : 'No unsaved changes'}</span>
          </div>
        </form>
      </Card>

      <Card title="Draft vs. plan and benchmarks" aside={<ProvenanceChip kind="derived" />}>
        <div className={styles.stack}>
          {plan ? (
            <>
              <h3>Bid validity vs signing</h3>
              <ValidityCoverage plan={plan} draft={draft} />
            </>
          ) : <EmptyState title="No plan to compare with" text="Add a plan in Planning to see the bid validity diagram." action={<Link to="/planning">Open Planning</Link>} />}
          <h3>Draft vs reference</h3>
          {glance.length === 0 && gaps.length === 0
            ? <EmptyState title="Nothing to compare yet" text="Charts need two numbers, a draft value and a reference." />
            : (
              <PairedBars
                ariaLabel="Draft against reference"
                rows={glance.map((r) => ({ ...r, info: <WhatItMeans row={r} onCite={setOpen} /> }))}
                gaps={gaps.map((g) => ({ ...g, action: g.canAdd ? <Link to="/project-data">Add tender data</Link> : undefined }))}
              />
            )}
        </div>
      </Card>

      <Card title="Specification checks" aside={<ProvenanceChip kind="derived" detail={`${checks.length} rules`} />}>
        <p className={styles.sub}>
          The draft above, including unsaved changes, checked against {plan ? <>the plan <strong>{plan.name}</strong></> : 'a plan (none chosen)'}, the project, contract data and the guidance note. The bars count the results; click a bar or a row below to open its checks, with the rule, the numbers compared and the evidence.
        </p>
        <SpecGroups checks={checks} onCite={setOpen} />
        <p className={styles.sub}>Performance security uses the range in the mock guidance note (change it in <span className="mono">SPEC_RULES</span>). "Cannot check" means no source here holds the number; nothing is estimated.</p>
        <div><span className={styles.sub}>Was this check useful? </span><FeedbackWidget targetId={`AI-LAYER-spec-${projectId}`} /></div>
      </Card>

      <Card title="Qualification and assistant"><EmptyState title="Planned" text="The qualification card and the retrieval assistant are specified but not built yet." /></Card>
      <ConfirmDeleteDialog open={confirming} onOpenChange={setConfirming} what="tender draft" detail={`Draft for ${project?.project_name ?? stored.project_id} (${stored.project_id})`} pending={remove.isPending}
        onConfirm={() => remove.mutate(stored, { onSuccess: () => setConfirming(false) })} />
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
