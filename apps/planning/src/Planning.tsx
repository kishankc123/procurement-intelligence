import { useEffect, useState } from 'react'
import { THRESHOLDS, can, whyDisabled } from '@pi/config'
import {
  countryReference, evaluationFinding, gate, plannedDurations, useCompletionReports, useCountryYears,
  useCurrentUser, usePlan, useProject, useRecommendations, useSavePlan, useUiStore,
  type Citation, type Plan,
} from '@pi/data'
import { Badge, Button, Card, DataGate, EmptyState, ProvenanceChip } from '@pi/ui'
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

function PlanForm({ plan }: { plan: Plan }) {
  const { role } = useCurrentUser()
  const save = useSavePlan()
  const [draft, setDraft] = useState(plan)
  useEffect(() => setDraft(plan), [plan])
  const allowed = can(role, 'edit_plan')
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const date = (k: 'planned_advertisement' | 'planned_bid_opening' | 'planned_evaluation_complete' | 'planned_signing', label: string) => (
    <label>{label}<input type="date" value={draft[k]} onChange={(e) => set(k, e.target.value)} disabled={!allowed} /></label>
  )
  const invalid = draft.planned_bid_opening < draft.planned_advertisement
  return (
    <Card title="Your plan" aside={<ProvenanceChip kind="entered" />}>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); save.mutate(draft) }}>
        {date('planned_advertisement', 'Planned advertisement')}
        {date('planned_bid_opening', 'Planned bid opening')}
        {date('planned_evaluation_complete', 'Planned evaluation complete')}
        {date('planned_signing', 'Planned contract signing')}
        <label>Category
          <select value={draft.category} onChange={(e) => set('category', e.target.value)} disabled={!allowed}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Method
          <select value={draft.method} onChange={(e) => set('method', e.target.value)} disabled={!allowed}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <div>
          <Button type="submit" variant="primary" disabled={invalid || save.isPending} disabledReason={allowed ? undefined : whyDisabled('edit_plan')}>Save plan</Button>
          {invalid && <p role="alert">Bid opening cannot be before advertisement.</p>}
          {save.isSuccess && <p role="status" className={styles.sub}>Saved.</p>}
        </div>
      </form>
    </Card>
  )
}

export default function Planning() {
  const projectId = useUiStore((s) => s.projectId)
  const project = useProject(projectId).data?.[0]
  const plan = usePlan(projectId).data?.[0]
  const country = project?.borrower_country_code ?? ''
  const years = useCountryYears(country).data ?? []
  const completions = useCompletionReports().data ?? []
  const recs = useRecommendations(projectId).data ?? []
  const [open, setOpen] = useState<Citation | null>(null)

  if (!project || !plan) return <Card state="loading">{null}</Card>

  const dur = plannedDurations(plan)
  const c51 = countryReference(years, country, 'C5.1')
  const c52 = countryReference(years, country, 'C5.2')
  const evalFinding = evaluationFinding(plan, c52)
  const cited = recs.filter((r) => r.citations.length > 0).length
  const completedGate = gate(completions.length, THRESHOLDS.restructuringModelMinProjects)
  const durationGate = gate(completions.length, THRESHOLDS.durationModelMinProjects)
  const outlierYears = years.filter((y) => y.flags.length > 0)

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Plan procurement package</h1>
        <p>{project.project_name} · {project.borrower_country}. Your planned dates, compared with what public data and your own entered contracts show.</p>
      </div>

      <PlanForm plan={plan} />

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

      <div className={styles.two}>
        <Card title="Duration model" aside={<Badge>Simulated</Badge>}>
          <DataGate gate={durationGate} title="Duration curve locked" unit="completed projects with key dates">
            <p>Curve available.</p>
          </DataGate>
        </Card>
        <Card title="Stage timeline" aside={<span className={styles.sub}>planned vs. actual vs. reference</span>}>
          <table className={styles.table}>
            <thead><tr><th>Stage</th><th>Planned</th><th>Actual</th><th>Reference</th></tr></thead>
            <tbody>
              {([
                ['Advertisement', plan.planned_advertisement, null],
                ['Bid opening', plan.planned_bid_opening, null],
                ['Evaluation complete', plan.planned_evaluation_complete, c52 ? `${c52.value} days (GPPD C5.2)` : null],
                ['Contract signing', plan.planned_signing, c51 ? `${c51.value} days from advertisement (GPPD C5.1)` : null],
              ] as const).map(([stage, planned, ref]) => (
                <tr key={stage}>
                  <td>{stage}</td>
                  <td><span className="mono">{planned}</span> <ProvenanceChip kind="entered" /></td>
                  <td><ProvenanceChip kind="missing" /></td>
                  <td>{ref ?? <span className={styles.sub}>None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className={styles.two}>
        <Card title="Country context" aside={<span className={styles.sub}>latest year reported</span>}>
          <table className={styles.table}>
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
          </table>
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
          <table className={styles.table}>
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
          </table>
        )}
        <p className={styles.sub}>Outcomes come from the completion report. <ProvenanceChip kind="public" /></p>
      </Card>

      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
