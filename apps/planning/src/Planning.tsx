import { Fragment, useEffect, useState } from 'react'
import { THRESHOLDS, can, fiscalYearOf, whyDisabled } from '@pi/config'
import {
  countryReference, evaluationFinding, gate, plannedDurations, useCompletionReports, useCountryYears,
  useCurrentUser, useDeletePlan, usePlan, useProject, useRecommendations, useSavePlan, useUiStore,
  type Citation, type Plan,
} from '@pi/data'
import { Badge, Button, Card, DataGate, EmptyState, ProvenanceChip, Select, TableScroll } from '@pi/ui'
import { CitationChip, FeedbackWidget, SourceDrawer } from '@pi/domain'
import styles from './Planning.module.css'

const CATEGORIES = ['Works', 'Goods', 'Consulting services']
const METHODS = ['Open competitive', 'Limited competitive', 'Shopping', 'Quality-based']

const INDICATORS = [
  { code: 'C5.1', label: 'Days from advertisement to award' },
  { code: 'C5.2', label: 'Average days for bid evaluation' },
  { code: 'C4.10b', label: 'Average bidders per works tender' },
  { code: 'C4.13', label: 'Cancelled procurement procedures' },
  { code: 'C4.12', label: 'Complaint resolution time (days)' },
]

type DateKey = 'planned_advertisement' | 'planned_bid_opening' | 'planned_evaluation_complete' | 'planned_signing'
const STAGES: { key: DateKey; label: string }[] = [
  { key: 'planned_advertisement', label: 'Advertisement' },
  { key: 'planned_bid_opening', label: 'Bid opening' },
  { key: 'planned_evaluation_complete', label: 'Evaluation complete' },
  { key: 'planned_signing', label: 'Contract signing' },
]

/** Reference text per stage, from GPPD for the project's country. */
function useStageReferences(projectId: string): Partial<Record<DateKey, string>> {
  const country = useProject(projectId).data?.[0]?.borrower_country_code ?? ''
  const years = useCountryYears(country).data ?? []
  const c51 = countryReference(years, country, 'C5.1')
  const c52 = countryReference(years, country, 'C5.2')
  return {
    planned_evaluation_complete: c52 ? `${c52.value} days (GPPD C5.2)` : undefined,
    planned_signing: c51 ? `${c51.value} days from advertisement (GPPD C5.1)` : undefined,
  }
}

/** The dropdown under a plan row: read-only stage timeline, with Edit plan, Full details and Close at the bottom. */
function PlanTimeline({ plan, onEdit, onFull, onClose }: { plan: Plan; onEdit: () => void; onFull: () => void; onClose: () => void }) {
  const { role } = useCurrentUser()
  const refs = useStageReferences(plan.project_id)
  const allowed = can(role, 'edit_plan')
  return (
    <div className={styles.expanded}>
      <div className={styles.expandedHead}>
        <strong>Stage timeline</strong>
        <ProvenanceChip kind="entered" />
      </div>
      <TableScroll><table className={styles.table}>
        <thead><tr><th>Stage</th><th>Planned</th><th>Actual</th><th>Reference</th></tr></thead>
        <tbody>
          {STAGES.map((st) => (
            <tr key={st.key}>
              <td>{st.label}</td>
              <td className="mono">{plan[st.key]}</td>
              <td><ProvenanceChip kind="missing" /></td>
              <td>{refs[st.key] ?? <span className={styles.sub}>None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></TableScroll>
      <div className={styles.row}>
        <Button variant="primary" onClick={onEdit} disabledReason={allowed ? undefined : whyDisabled('edit_plan')}>Edit plan</Button>
        <Button onClick={onFull}>Full details</Button>
        <Button variant="danger" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

/** Top of the full details page: read-only until Edit plan, then Save plan (green) and Delete plan (red). */
function PlanEditor({ plan, startEditing, onDeleted }: { plan: Plan; startEditing: boolean; onDeleted: () => void }) {
  const { role } = useCurrentUser()
  const refs = useStageReferences(plan.project_id)
  const save = useSavePlan()
  const remove = useDeletePlan()
  const [editing, setEditing] = useState(startEditing)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState(plan)
  useEffect(() => setDraft(plan), [plan])
  const allowed = can(role, 'edit_plan')
  const reason = allowed ? undefined : whyDisabled('edit_plan')
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const invalid = draft.planned_bid_opening < draft.planned_advertisement
  const cancel = () => { setDraft(plan); setEditing(false); setConfirming(false) }

  return (
    <Card title="Plan and stage timeline" aside={<ProvenanceChip kind="entered" />}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(draft, { onSuccess: () => setEditing(false) }) }}>
        <div className={styles.form}>
          <label>Category
            <Select value={draft.category} onValueChange={(v) => set('category', v)} disabled={!editing} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </label>
          <label>Method
            <Select value={draft.method} onValueChange={(v) => set('method', v)} disabled={!editing} options={METHODS.map((m) => ({ value: m, label: m }))} />
          </label>
        </div>
        <TableScroll><table className={styles.table}>
          <thead><tr><th>Stage</th><th>Planned</th><th>Actual</th><th>Reference</th></tr></thead>
          <tbody>
            {STAGES.map((st) => (
              <tr key={st.key}>
                <td>{st.label}</td>
                <td><input type="date" aria-label={`Planned ${st.label.toLowerCase()}`} value={draft[st.key]} onChange={(e) => set(st.key, e.target.value)} disabled={!editing} /></td>
                <td><ProvenanceChip kind="missing" /></td>
                <td>{refs[st.key] ?? <span className={styles.sub}>None</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></TableScroll>
        <div className={styles.row}>
          {editing ? (
            <>
              <Button type="submit" variant="success" disabled={invalid || save.isPending}>Save plan</Button>
              <Button type="button" onClick={cancel}>Cancel</Button>
              {confirming ? (
                <>
                  <span role="alert">Delete this plan for good?</span>
                  <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(plan, { onSuccess: onDeleted })}>Confirm delete</Button>
                  <Button type="button" onClick={() => setConfirming(false)}>Keep plan</Button>
                </>
              ) : <Button type="button" variant="danger" onClick={() => setConfirming(true)}>Delete plan</Button>}
            </>
          ) : <Button type="button" variant="primary" onClick={() => setEditing(true)} disabledReason={reason}>Edit plan</Button>}
          {invalid && <span role="alert">Bid opening cannot be before advertisement.</span>}
          {save.isSuccess && !editing && <span role="status" className={styles.sub}>Saved.</span>}
        </div>
      </form>
    </Card>
  )
}

function PlanList({ plans, selectedId, onSelect, onFull, onEdit }: { plans: Plan[]; selectedId: string | null; onSelect: (id: string | null) => void; onFull: (id: string) => void; onEdit: (id: string) => void }) {
  return (
    <Card title="Plans" aside={<ProvenanceChip kind="entered" />}>
      {plans.length === 0 ? <EmptyState title="No plans yet" text="Plans you enter for this project appear here." /> : (
        <TableScroll><table className={`${styles.table} ${styles.plans}`}>
          <thead><tr><th>Plan</th><th>Category</th><th>Method</th><th>Advertisement</th><th>Signing</th><th>Days to sign</th></tr></thead>
          <tbody>
            {plans.map((p) => (
              <Fragment key={p.id}>
              <tr
                className={`${styles.clickable} ${p.id === selectedId ? styles.selected : ''}`}
                tabIndex={0}
                aria-current={p.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(p.id === selectedId ? null : p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id === selectedId ? null : p.id) } }}
              >
                <td>{p.name}<br /><span className={`mono ${styles.nowrap}`}>{p.id}</span></td>
                <td>{p.category}</td>
                <td>{p.method}</td>
                <td className={`mono ${styles.nowrap}`}>{p.planned_advertisement}</td>
                <td className={`mono ${styles.nowrap}`}>{p.planned_signing}</td>
                <td className={`mono ${styles.nowrap}`}>{plannedDurations(p).advertisementToSigning}</td>
              </tr>
              {p.id === selectedId && (
                <tr>
                  <td colSpan={6} className={styles.expandedCell}>
                    <PlanTimeline plan={p} onEdit={() => onEdit(p.id)} onFull={() => onFull(p.id)} onClose={() => onSelect(null)} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table></TableScroll>
      )}
      <p className={styles.sub}>Each row is a tender you are preparing to run. Click a row to see and edit its stage timeline.</p>
    </Card>
  )
}

function PlanDetail({ plan, startEditing, onBack, onDeleted }: { plan: Plan; startEditing: boolean; onBack: () => void; onDeleted: () => void }) {
  const project = useProject(plan.project_id).data?.[0]
  const country = project?.borrower_country_code ?? ''
  const years = useCountryYears(country).data ?? []
  const completions = useCompletionReports().data ?? []
  const recs = useRecommendations(plan.project_id).data ?? []
  const [open, setOpen] = useState<Citation | null>(null)

  if (!project) return <Card state="loading">{null}</Card>

  const dur = plannedDurations(plan)
  const c51 = countryReference(years, country, 'C5.1')
  const c52 = countryReference(years, country, 'C5.2')
  const evalFinding = evaluationFinding(plan, c52)
  const cited = recs.filter((r) => r.citations.length > 0).length
  const completedGate = gate(completions.length, THRESHOLDS.restructuringModelMinProjects)
  const durationGate = gate(completions.length, THRESHOLDS.durationModelMinProjects)
  const outlierYears = years.filter((y) => y.flags.length > 0)

  return (
    <>
      <div className={styles.head}>
        <Button onClick={onBack}>Back to plans</Button>
        <h1>{plan.name}</h1>
        <p>{plan.category} · {plan.method} · {project.project_name}, {project.borrower_country}</p>
      </div>

      <PlanEditor plan={plan} startEditing={startEditing} onDeleted={onDeleted} />

      <div className={styles.kpis}>
        <Card title="Planned: advertisement to signing">
          <p><span className={styles.big}>{dur.advertisementToSigning}</span> <span className={styles.unit}>days</span></p>
          <ProvenanceChip kind="derived" detail="from your plan" />
        </Card>
        <Card title="Country reference">
          {c51 ? (
            <>
              <p><span className={styles.big}>{c51.value}</span> <span className={styles.unit}>days</span></p>
              <p className={styles.sub}>Advertisement to award, latest year reported ({c51.year}).</p>
              <ProvenanceChip kind="public" detail="GPPD C5.1" />
            </>
          ) : <EmptyState title="Not reported" text={`No year reports C5.1 for ${project.borrower_country}.`} />}
        </Card>
        <Card title="Restructuring likelihood">
          <DataGate gate={completedGate} title="Not available" unit="completed projects with reports">
            <p>Model available.</p>
          </DataGate>
        </Card>
        <Card title="Evidence coverage">
          <p><span className={styles.big}>{cited}</span> <span className={styles.unit}>of {recs.length} claims</span></p>
          <p className={styles.sub}>have a citation in this brief</p>
          <ProvenanceChip kind="derived" />
        </Card>
      </div>

      <Card title="Duration model" aside={<Badge>Simulated</Badge>}>
        <DataGate gate={durationGate} title="Duration curve locked" unit="completed projects with key dates">
          <p>Curve available.</p>
        </DataGate>
      </Card>

      <div className={styles.two}>
        <Card title="Country context" aside={<span className={styles.sub}>latest year reported</span>}>
          <TableScroll><table className={styles.table}>
            <thead><tr><th>Indicator</th><th>Value</th><th>Year</th><th>Source</th></tr></thead>
            <tbody>
              {INDICATORS.map((i) => {
                const r = countryReference(years, country, i.code)
                return (
                  <tr key={i.code}>
                    <td>{i.label}</td>
                    <td className="mono">{r ? r.value : <ProvenanceChip kind="missing" detail="not reported" />}</td>
                    <td className="mono">{r ? r.year : 'n/a'}</td>
                    <td>{r ? <ProvenanceChip kind="public" detail={`GPPD ${i.code}`} /> : <span className={styles.sub}>GPPD {i.code}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></TableScroll>
          <p className={styles.sub}>
            {outlierYears.length > 0
              ? `Outlier values flagged and excluded from comparisons: ${outlierYears.map((y) => `${y.year} ${y.flags.join(', ')}`).join('; ')}.`
              : 'No outlier values flagged for this country.'}
          </p>
        </Card>

        <Card title="Recommendations" aside={<span className={styles.sub}>each with its basis</span>}>
          {evalFinding && (
            <div className={styles.rec}>
              <div className={styles.row}>
                <Badge tone={evalFinding.within ? 'low' : 'medium'}>{evalFinding.within ? 'Within range' : 'Above reference'}</Badge>
                <strong>Evaluation period {evalFinding.within ? 'matches' : 'exceeds'} the country reference.</strong>
              </div>
              <p>Your plan allows {evalFinding.planned} days from bid opening to evaluation complete. The country reference is {evalFinding.reference} days ({evalFinding.year}).</p>
              <div className={styles.row}><ProvenanceChip kind="derived" /><ProvenanceChip kind="public" detail="GPPD C5.2" /><ProvenanceChip kind="entered" detail="your plan" /></div>
            </div>
          )}
          {recs.map((r) => (
            <div key={r.id} className={styles.rec}>
              <div className={styles.row}>
                <Badge tone={r.kind === 'withheld' ? 'medium' : 'neutral'}>{r.kind === 'withheld' ? 'Withheld' : r.kind === 'lesson' ? 'Lesson' : 'Finding'}</Badge>
                <strong>{r.title}</strong>
              </div>
              <p className={styles.sub}>{r.text}</p>
              {r.citations.length > 0 ? (
                <div className={styles.row}>
                  {r.citations.map((c) => <CitationChip key={c.ref_id} citation={c} onOpen={setOpen} />)}
                  <FeedbackWidget targetId={r.id} />
                </div>
              ) : <p className={styles.sub}>No supporting citation, so this claim is withheld.</p>}
            </div>
          ))}
        </Card>
      </div>

      <Card title="Similar completed projects" aside={<span className={styles.sub}>from completion reports</span>}>
        {completions.length === 0 ? <EmptyState title="No completion reports ingested" /> : (
          <TableScroll><table className={styles.table}>
            <thead><tr><th>Project</th><th>Completion rating</th><th>Restructurings</th><th>Closing extension</th></tr></thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id}>
                  <td>{c.project_name}<br /><span className="mono">{c.id}</span></td>
                  <td>{c.outcome_rating}</td>
                  <td className="mono">{c.restructurings}</td>
                  <td className="mono">{c.closing_extension_months > 0 ? `+${c.closing_extension_months} months` : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        )}
        <p className={styles.sub}>Outcomes come from the completion report. <ProvenanceChip kind="public" /></p>
      </Card>

      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </>
  )
}

export default function Planning() {
  const projectId = useUiStore((s) => s.projectId)
  const fiscalYear = useUiStore((s) => s.fiscalYear)
  const project = useProject(projectId).data?.[0]
  const plans = usePlan(projectId).data
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailEdit, setDetailEdit] = useState(false)

  if (!project || !plans) return <Card state="loading">{null}</Card>
  const detail = plans.find((p) => p.id === detailId)

  const openDetail = (id: string, edit: boolean) => { setDetailEdit(edit); setDetailId(id) }
  if (detail) {
    return (
      <div className={styles.page}>
        <PlanDetail plan={detail} startEditing={detailEdit} onBack={() => setDetailId(null)} onDeleted={() => { setDetailId(null); setSelectedId(null) }} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Plan procurement packages</h1>
        <p>{project.project_name} · {project.borrower_country}. The tenders you are preparing, compared with what public data and your own entered contracts show.</p>
      </div>
      <PlanList plans={plans} selectedId={selectedId} onSelect={setSelectedId} onFull={(id) => openDetail(id, false)} onEdit={(id) => openDetail(id, true)} />
      {plans.some((p) => fiscalYearOf(p.planned_signing) !== fiscalYear) && (
        <p role="status" className={styles.sub}>Some plans sign outside the selected FY{fiscalYear}.</p>
      )}
    </div>
  )
}
