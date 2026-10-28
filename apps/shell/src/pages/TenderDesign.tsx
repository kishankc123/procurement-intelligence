import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { can, whyDisabled } from '@pi/config'
import {
  countryReference, glanceRows, plannedDurations, specificationChecks, tenderCandidates, tenderComparison, useAllPlans, useChunks, useContracts, useCountryYears, useDocs, useProject, useTenderHistory, useCurrentUser, useEnrichments, usePlan, useSaveTenderDraft, useTenderDraft, useUiStore,
  type Citation, type Comparison, type Plan, type TenderDraft,
} from '@pi/data'
import { Badge, BulletChart, Button, Card, EmptyState, ProvenanceChip, Select, TableScroll } from '@pi/ui'
import { CitationChip, FeedbackWidget, SourceDrawer } from '@pi/domain'
import { SpecGroups } from './SpecGroups'
import { ValidityCoverage } from './ValidityCoverage'
import styles from './ProjectData.module.css'

const METHODS = ['Lowest evaluated price', 'Quality and cost based', 'Fixed budget']
const TONE = { ok: { tone: 'low', label: 'OK' }, attention: { tone: 'high', label: 'Check' }, info: { tone: 'neutral', label: 'Info' } } as const

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

function ReferenceCell({ c }: { c: Comparison }) {
  if (c.gated) {
    return <EmptyState title="Missing" text={`Needs ${c.gated.required} contracts with this value. ${c.gated.n} so far.`} action={<Link to="/project-data">Add tender data</Link>} />
  }
  if (c.missing) return <EmptyState title="Missing" text={c.missing} />
  return (
    <>
      <span className="mono">{c.reference}</span>
      <p className={styles.sub}>{c.basis}</p>
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
  const waiting = rows.flatMap((r) => r.comparisons).filter((c) => c.gated).length

  return (
    <div className={styles.page}>
      <div><h1>Tender design</h1><p className={styles.sub}>Draft the clauses, then see each one against your plan and against entered contract data, with the difference worked out.</p></div>

      <Card title="Draft clauses" aside={<ProvenanceChip kind="entered" />}>
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

      <Card title="At a glance" aside={<ProvenanceChip kind="derived" />}>
        <div className={styles.stack}>
          <p className={styles.sub}>The same comparisons as the table below, drawn. They follow the draft above, including unsaved changes.</p>
          {plan ? (
            <>
              <h3>Do bids stay valid until signing?</h3>
              <ValidityCoverage plan={plan} draft={draft} />
            </>
          ) : <EmptyState title="No plan to compare with" text="Add a plan in Planning to see the bid validity diagram." action={<Link to="/planning">Open Planning</Link>} />}
          <h3>Draft against its reference</h3>
          {glance.length === 0 ? <EmptyState title="Nothing to draw yet" text="Charts need two numbers, a draft value and a reference." /> : <BulletChart ariaLabel="Draft against reference" rows={glance} />}
          {waiting > 0 && (
            <p className={styles.sub}>{waiting} more comparison{waiting === 1 ? '' : 's'} with contract data {waiting === 1 ? 'is' : 'are'} not drawn: too few contracts have the value entered. <Link to="/project-data">Add tender data</Link></p>
          )}
        </div>
      </Card>

      <Card title="Draft vs. plan and benchmarks" aside={<ProvenanceChip kind="derived" />}>
        <div className={styles.scroll}>
          <TableScroll><table className={styles.table}>
            <thead><tr><th>Clause</th><th>Your draft</th><th>Compared with</th><th>Reference</th><th>Difference</th><th>What it means</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  {r.comparisons.map((c, i) => (
                    <tr key={c.against + i}>
                      {i === 0 && <><td rowSpan={r.comparisons.length}><strong>{r.label}</strong></td><td rowSpan={r.comparisons.length} className="mono">{r.draft}</td></>}
                      <td>{c.against} {c.gated || c.missing ? null : <ProvenanceChip kind={c.provenance} detail={c.n !== undefined ? `n=${c.n}` : undefined} />}</td>
                      <td><ReferenceCell c={c} /></td>
                      <td className="mono">{c.difference ?? <ProvenanceChip kind="missing" />}</td>
                      <td>
                        {c.verdict ? (
                          <>
                            <Badge tone={TONE[c.verdict.tone].tone}>{TONE[c.verdict.tone].label}</Badge>
                            <p>{c.verdict.text}</p>
                            {c.citations.map((cit) => <CitationChip key={cit.ref_id} citation={cit} onOpen={setOpen} />)}
                          </>
                        ) : <span className={styles.sub}>Not compared</span>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table></TableScroll>
        </div>
        <p className={styles.sub}>Difference is your draft minus the reference. Benchmarks use contracts in FY{fiscalYear} and appear only once enough contracts have the value. Nothing is estimated where a source is missing.</p>
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
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
