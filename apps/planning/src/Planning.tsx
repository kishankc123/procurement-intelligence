import { Fragment, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import { THRESHOLDS, can, fiscalYearOf, whyDisabled } from '@pi/config'
import {
  countryReference, evaluationFinding, gate, plannedDurations, useCompletionReports, useCountryYears,
  useCurrentUser, useDeletePlan, useMeta, usePlan, useProject, useRecommendations, useSavePlan, useUiStore,
  type Citation, type Plan,
} from '@pi/data'
import {
  ArrowLeft, Badge, Button, Card, DataGate, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState,
  ProvenanceChip, Select, TableScroll, Paged, Carousel, ConfirmDeleteDialog, DeleteButton } from '@pi/ui'
import { CitationChip, FeedbackWidget, SourceDrawer } from '@pi/domain'
import { PlanAgenda } from './PlanAgenda'
import styles from './Planning.module.css'

/** Where this remote is mounted in the shell. Each plan's full details have their own address under it. */
const BASE = '/planning'
const detailPath = (planId: string) => `${BASE}/full-details/${encodeURIComponent(planId)}`

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

/** Read-only stage table: planned dates, actual (missing) and the country reference. */
function StageTable({ plan }: { plan: Plan }) {
  const refs = useStageReferences(plan.project_id)
  return (
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
  )
}

/** The dropdown under a plan row: read-only stage timeline, with Edit plan, Full details and Close at the bottom. */
function PlanTimeline({ plan, onEdit, onFull, onClose }: { plan: Plan; onEdit: () => void; onFull?: () => void; onClose: () => void }) {
  const { role } = useCurrentUser()
  const allowed = can(role, 'edit_plan')
  return (
    <div className={styles.expanded}>
      <div className={styles.expandedHead}>
        <strong>Stage timeline</strong>
        <ProvenanceChip kind="entered" />
      </div>
      <StageTable plan={plan} />
      <div className={styles.row}>
        <Button variant="primary" onClick={onEdit} disabledReason={allowed ? undefined : whyDisabled('edit_plan')}>Edit plan</Button>
        {onFull && <Button onClick={onFull}>Full details</Button>}
        <Button variant="danger" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

/** Edit a plan in a modal: change the category, method or dates, then Save plan, Cancel or Delete plan. No page change. */
export function EditPlanDialog({ plan, open, onOpenChange, onDeleted }: { plan: Plan; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: () => void }) {
  const save = useSavePlan()
  const remove = useDeletePlan()
  const [draft, setDraft] = useState(plan)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { if (open) { setDraft(plan); setConfirming(false) } }, [open, plan])
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const invalid = draft.planned_bid_opening < draft.planned_advertisement

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>{plan.name} · <span className="mono">{plan.id}</span></DialogDescription>
        </DialogHeader>
        <form className={styles.dialogForm} onSubmit={(e) => { e.preventDefault(); save.mutate(draft, { onSuccess: () => onOpenChange(false) }) }}>
          <label>Category
            <Select value={draft.category} onValueChange={(v) => set('category', v)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </label>
          <label>Method
            <Select value={draft.method} onValueChange={(v) => set('method', v)} options={METHODS.map((m) => ({ value: m, label: m }))} />
          </label>
          <div className={styles.dialogDates}>
            {STAGES.map((st) => (
              <label key={st.key}>{st.label}
                <input type="date" value={draft[st.key]} onChange={(e) => set(st.key, e.target.value)} />
              </label>
            ))}
          </div>
          {invalid && <p role="alert" className={styles.problem}>Bid opening cannot be before advertisement.</p>}
          <div className={styles.dialogActions}>
            <Button type="submit" variant="success" disabled={invalid || save.isPending}>Save plan</Button>
            <Button type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <DeleteButton onClick={() => setConfirming(true)} label="Delete plan" />
          </div>
        </form>
        <ConfirmDeleteDialog open={confirming} onOpenChange={setConfirming} what="plan" detail={`${plan.name} (${plan.id})`} pending={remove.isPending}
          onConfirm={() => remove.mutate(plan, { onSuccess: () => { setConfirming(false); onOpenChange(false); onDeleted() } })} />
      </DialogContent>
    </Dialog>
  )
}

/** The plans table. `onFull` is optional (the chat has no full-details page); `compact` drops the category and method columns for narrow places. */
export function PlanList({ plans, selectedId, onSelect, onFull, onEdit, onDelete, compact }: { plans: Plan[]; selectedId: string | null; onSelect: (id: string | null) => void; onFull?: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void; compact?: boolean }) {
  const { role } = useCurrentUser()
  const allowed = can(role, 'edit_plan')
  return (
    <Card title="Plans" downloadName="Plans" aside={<ProvenanceChip kind="entered" />}>
      {plans.length === 0 ? <EmptyState title="No plans yet" text="Plans you enter for this project appear here." /> : (
        <Paged items={plans} label="plans">{(pageRows) =><table className={`${styles.table} ${styles.plans}`}>
          <thead><tr><th>Plan</th>{!compact && <><th>Category</th><th>Method</th></>}<th>Advertisement</th><th>Signing</th><th>Days to sign</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {pageRows.map((p) => (
              <Fragment key={p.id}>
              <tr
                className={`${styles.clickable} ${p.id === selectedId ? styles.selected : ''}`}
                tabIndex={0}
                aria-current={p.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(p.id === selectedId ? null : p.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id === selectedId ? null : p.id) } }}
              >
                <td>{p.name}<br /><span className={`mono ${styles.nowrap}`}>{p.id}</span></td>
                {!compact && <><td data-label="Category">{p.category}</td><td data-label="Method">{p.method}</td></>}
                <td className={`mono ${styles.nowrap}`} data-label="Advertisement">{p.planned_advertisement}</td>
                <td className={`mono ${styles.nowrap}`} data-label="Signing">{p.planned_signing}</td>
                <td className={`mono ${styles.nowrap}`} data-label="Days to sign">{plannedDurations(p).advertisementToSigning}</td>
                <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <DeleteButton onClick={() => onDelete(p.id)} disabledReason={allowed ? undefined : whyDisabled('edit_plan')} />
                </td>
              </tr>
              {p.id === selectedId && (
                <tr>
                  <td colSpan={compact ? 5 : 7} className={styles.expandedCell}>
                    <PlanTimeline plan={p} onEdit={() => onEdit(p.id)} onFull={onFull ? () => onFull(p.id) : undefined} onClose={() => onSelect(null)} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>}</Paged>
      )}
      <p className={styles.sub}>Each row is a tender you are preparing to run. Click a row to see and edit its stage timeline.</p>
    </Card>
  )
}

function PlanDetail({ plan, onBack, onDeleted }: { plan: Plan; onBack: () => void; onDeleted: () => void }) {
  const { role } = useCurrentUser()
  const [editing, setEditing] = useState(false)
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
        <div className={styles.row}>
          <Button onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to plans</Button>
          <Button variant="primary" onClick={() => setEditing(true)} disabledReason={can(role, 'edit_plan') ? undefined : whyDisabled('edit_plan')}>Edit plan</Button>
        </div>
        <h1>{plan.name}</h1>
        <p>{plan.category} · {plan.method} · {project.project_name}, {project.borrower_country}</p>
      </div>

      <Card title="Stage timeline" downloadName="Stage timeline" aside={<ProvenanceChip kind="entered" />}>
        <StageTable plan={plan} />
      </Card>
      <EditPlanDialog plan={plan} open={editing} onOpenChange={setEditing} onDeleted={onDeleted} />

      <Carousel ariaLabel="Key figures for this plan">
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
      </Carousel>

      <Card title="Duration model" downloadName="Duration model" aside={<Badge>Simulated</Badge>}>
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

      <Card title="Similar completed projects" downloadName="Similar completed projects" aside={<span className={styles.sub}>from completion reports</span>}>
        {completions.length === 0 ? <EmptyState title="No completion reports ingested" /> : (
          <Paged items={completions} label="completion reports" maxHeight="420px">{(pageRows) => <table className={styles.table}>
            <thead><tr><th>Project</th><th>Completion rating</th><th>Restructurings</th><th>Closing extension</th></tr></thead>
            <tbody>
              {pageRows.map((c) => (
                <tr key={c.id}>
                  <td>{c.project_name}<br /><span className="mono">{c.id}</span></td>
                  <td>{c.outcome_rating}</td>
                  <td className="mono">{c.restructurings}</td>
                  <td className="mono">{c.closing_extension_months > 0 ? `+${c.closing_extension_months} months` : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>}</Paged>
        )}
        <p className={styles.sub}>Outcomes come from the completion report. <ProvenanceChip kind="public" /></p>
      </Card>

      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** /planning: the plans table with its timeline. Edit plan opens a modal; Full details goes to its own address. */
function PlanListPage() {
  const navigate = useNavigate()
  const projectId = useUiStore((s) => s.projectId)
  const fiscalYear = useUiStore((s) => s.fiscalYear)
  const project = useProject(projectId).data?.[0]
  const plans = usePlan(projectId).data
  const asOf = useMeta().data?.as_of_date
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const remove = useDeletePlan()

  if (!project || !plans) return <Card state="loading">{null}</Card>
  const editing = plans.find((p) => p.id === editingId)
  const deleting = plans.find((p) => p.id === deletingId)

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Plan procurement packages</h1>
        <p>{project.project_name} · {project.borrower_country}. The tenders you are preparing, compared with what public data and your own entered contracts show.</p>
      </div>
      {asOf && <PlanAgenda plans={plans} asOf={asOf} />}
      <PlanList plans={plans} selectedId={selectedId} onSelect={setSelectedId} onFull={(id) => navigate(detailPath(id))} onEdit={setEditingId} onDelete={setDeletingId} />
      {deleting && (
        <ConfirmDeleteDialog open onOpenChange={(o) => { if (!o) setDeletingId(null) }} what="plan" detail={`${deleting.name} (${deleting.id})`} pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting, { onSuccess: () => { setDeletingId(null); setSelectedId(null) } })} />
      )}
      {plans.some((p) => fiscalYearOf(p.planned_signing) !== fiscalYear) && (
        <p role="status" className={styles.sub}>Some plans sign outside the selected FY{fiscalYear}.</p>
      )}
      {editing && <EditPlanDialog plan={editing} open onOpenChange={(o) => { if (!o) setEditingId(null) }} onDeleted={() => { setEditingId(null); setSelectedId(null) }} />}
    </div>
  )
}

/** /planning/full-details/:planId: everything about one plan. */
function PlanDetailPage() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const projectId = useUiStore((s) => s.projectId)
  const plans = usePlan(projectId).data
  if (!plans) return <Card state="loading">{null}</Card>
  const plan = plans.find((p) => p.id === planId)
  if (!plan) {
    return (
      <div className={styles.page}>
        <Card title="Plan not found">
          <EmptyState title="This plan is not on the selected project" text="It may have been deleted, or belong to another project." action={<Button onClick={() => navigate(BASE)}>Back to plans</Button>} />
        </Card>
      </div>
    )
  }
  return (
    <div className={styles.page}>
      <PlanDetail plan={plan} onBack={() => navigate(BASE)} onDeleted={() => navigate(BASE)} />
    </div>
  )
}

export default function Planning() {
  return (
    <Routes>
      <Route index element={<PlanListPage />} />
      <Route path="full-details/:planId" element={<PlanDetailPage />} />
      <Route path="*" element={<Navigate to={BASE} replace />} />
    </Routes>
  )
}
