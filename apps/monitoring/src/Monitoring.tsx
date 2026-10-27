import { useState } from 'react'
import { ROLES, THRESHOLDS, can, whyDisabled } from '@pi/config'
import {
  deriveAlerts, timeElapsedPct, useAlertStates, useAmendments, useAssignAlert, useContracts, useCurrentUser,
  useEnrichments, useGovernance, useMeta, useProject, useReports, useUiStore, type Citation,
} from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { CitationChip, SourceDrawer } from '@pi/domain'
import styles from './Monitoring.module.css'

function AssignControl({ alertId, current }: { alertId: string; current: string | null }) {
  const { role } = useCurrentUser()
  const assign = useAssignAlert()
  const [who, setWho] = useState<string>(ROLES[0]?.label ?? '')
  const allowed = can(role, 'assign_alerts')
  return (
    <span className={styles.assign}>
      <select aria-label="Assign to" value={who} onChange={(e) => setWho(e.target.value)} disabled={!allowed}>
        {ROLES.map((r) => <option key={r.id}>{r.label}</option>)}
      </select>{' '}
      <Button onClick={() => assign.mutate({ id: alertId, assignee: who })} disabledReason={allowed ? undefined : whyDisabled('assign_alerts')}>{current ? 'Reassign' : 'Assign'}</Button>
    </span>
  )
}

function DisbursementChart({ points }: { points: { x: number; y: number; label: string }[] }) {
  const W = 420, H = 220, pad = 36
  const px = (v: number) => pad + (v / 100) * (W - pad - 10)
  const py = (v: number) => H - pad - (v / 100) * (H - pad - 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Disbursement versus time elapsed" width="100%">
      <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)} stroke="#7A8CA0" strokeDasharray="4 4" />
      <text x={px(60)} y={py(72)} fontSize="11" fill="#566678">On pace</text>
      <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(0)} stroke="#DDE3EA" /><line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(100)} stroke="#DDE3EA" />
      {[0, 50, 100].map((t) => <text key={t} x={px(t)} y={H - 18} fontSize="11" fill="#566678" textAnchor="middle">{t}%</text>)}
      {[0, 50, 100].map((t) => <text key={`y${t}`} x={pad - 6} y={py(t) + 4} fontSize="11" fill="#566678" textAnchor="end">{t}%</text>)}
      <polyline fill="none" stroke="#2456A6" strokeWidth="2" points={points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />
      {points.map((p, i) => (
        <g key={p.label}><circle cx={px(p.x)} cy={py(p.y)} r={i === points.length - 1 ? 5 : 3.5} fill={i === points.length - 1 ? '#C0392B' : '#2456A6'} />
          {i === points.length - 1 && <text x={px(p.x) + 8} y={py(p.y) - 6} fontSize="11" fill="#8A1C14">Latest report</text>}</g>
      ))}
      <text x={W / 2} y={H - 3} fontSize="11" fill="#566678" textAnchor="middle">Share of time from effectiveness to closing</text>
    </svg>
  )
}

export default function Monitoring() {
  const { projectId, fiscalYear } = useUiStore()
  const project = useProject(projectId).data?.[0]
  const reports = useReports(projectId).data ?? []
  const contracts = useContracts(projectId, fiscalYear).data ?? []
  const enrichments = useEnrichments().data ?? []
  const amendments = useAmendments().data ?? []
  const states = useAlertStates().data ?? []
  const asOf = useMeta().data?.as_of_date
  const gov = useGovernance(project?.borrower_country_code ?? '').data ?? []
  const [open, setOpen] = useState<Citation | null>(null)

  if (!project || !asOf) return <Card state="loading">{null}</Card>

  const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
  const alerts = deriveAlerts({
    project, reports, contracts,
    enrichments: enrichments.filter((e) => refs.has(e.contract_ref)),
    amendments: amendments.filter((a) => refs.has(a.contract_ref)),
    states, asOf,
  })
  const latest = [...reports].sort((a, b) => b.sequence - a.sequence)[0]
  const elapsed = latest ? timeElapsedPct(project, latest.date) : null
  const points = [...reports].sort((a, b) => a.sequence - b.sequence).map((r) => ({ x: timeElapsedPct(project, r.date), y: r.disbursed_pct, label: `ISR ${r.sequence}` }))
  const count = (signal: string) => alerts.filter((a) => a.signal === signal).length
  const govLatest = [...gov].sort((a, b) => b.year - a.year)[0]

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Execution and monitoring</h1>
        <p>Warning signals from supervision reports and from the contract data your team enters, ranked by severity. Latest data as of {asOf}.</p>
      </div>

      <div className={styles.kpis}>
        <Card title="Rating drops"><p><span className={styles.big}>{count('rating_drop')}</span></p><ProvenanceChip kind="public" detail="supervision reports" /></Card>
        <Card title="Disbursed vs. time elapsed">
          {latest && elapsed !== null ? (<>
            <p><span className={styles.big}>{latest.disbursed_pct - elapsed}</span> <span className={styles.unit}>points</span></p>
            <p className={styles.sub}>Latest report: {latest.disbursed_pct}% disbursed, {elapsed}% of time elapsed. Alert above {THRESHOLDS.disbursementLagPoints} points.</p>
            <ProvenanceChip kind="derived" detail={`n=${reports.length} reports`} />
          </>) : <EmptyState title="No supervision reports" />}
        </Card>
        <Card title="Contracts past entered end date"><p><span className={styles.big}>{count('contract_past_end')}</span> <span className={styles.unit}>of {contracts.length}</span></p><ProvenanceChip kind="entered" /></Card>
        <Card title="Approved amendments"><p><span className={styles.big}>{count('amendment')}</span></p><ProvenanceChip kind="entered" /></Card>
      </div>

      <Card title="Early-warning board" aside={<span className={styles.sub}>every flag shows where it comes from</span>}>
        {alerts.length === 0 ? <EmptyState title="No alerts for this selection" text="Signals appear when supervision ratings change or approved entered data crosses a rule." /> : alerts.map((a) => (
          <div key={a.id} className={`${styles.alert} ${styles[a.severity]}`}>
            <div className={styles.row}><Badge tone={a.severity}>{a.severity[0]?.toUpperCase() + a.severity.slice(1)}</Badge><strong>{a.title}</strong><span className="mono">{a.id}</span>{a.assignee && <Badge>Assigned to {a.assignee}</Badge>}</div>
            <p className={styles.sub}>{a.text}</p>
            <div className={styles.row}>
              <ProvenanceChip kind={a.provenance} />
              {a.citations.map((c) => <CitationChip key={c.ref_id} citation={c} onOpen={setOpen} />)}
              <Button onClick={() => { const c = a.citations[0]; if (c) setOpen(c) }}>See evidence</Button>
              <AssignControl alertId={a.id} current={a.assignee} />
            </div>
          </div>
        ))}
      </Card>

      <div className={styles.two}>
        <Card title="Disbursement vs. time elapsed" aside={<ProvenanceChip kind="public" detail="one point per report" />}>
          {points.length < 2 ? <EmptyState title="Needs at least 2 supervision reports" text={`${points.length} available.`} /> : <DisbursementChart points={points} />}
        </Card>
        <Card title="Project key dates" aside={<ProvenanceChip kind="public" />}>
          <table className={styles.table}>
            <thead><tr><th>Milestone</th><th>Planned</th><th>Actual or revised</th></tr></thead>
            <tbody>
              <tr><td>Approval</td><td className="mono">{project.approval_date}</td><td className="mono">{project.approval_date}</td></tr>
              <tr><td>Effectiveness</td><td className="mono">{project.effectiveness_planned}</td><td className="mono">{project.effectiveness_actual ?? '—'}</td></tr>
              <tr><td>Closing</td><td className="mono">{project.closing_date_planned}</td><td className="mono">{project.closing_date_revised ?? '—'}</td></tr>
            </tbody>
          </table>
          <h3>Governance context</h3>
          {govLatest ? (
            <table className={styles.table}><tbody>
              {Object.entries(govLatest.wgi).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="mono">{v}</td><td><ProvenanceChip kind="public" detail={`WGI ${govLatest.year}`} /></td></tr>)}
              <tr><td>Transparency and accountability (CPIA 16)</td><td className="mono">{govLatest.cpia_16 ?? <ProvenanceChip kind="missing" detail="not covered" />}</td><td /></tr>
            </tbody></table>
          ) : <EmptyState title="No governance data for this country" />}
        </Card>
      </div>
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
