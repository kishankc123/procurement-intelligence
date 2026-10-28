import { useRef, useState } from 'react'
import { ROLES, THRESHOLDS, can, whyDisabled } from '@pi/config'
import {
  deriveAlerts, timeElapsedPct, useAlertStates, useAmendments, useAssignAlert, useContracts, useCurrentUser,
  useEnrichments, useGovernance, useMeta, useProject, useReports, useUiStore, type Citation,
} from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip, Select, TableScroll, Carousel } from '@pi/ui'
import { CitationChip, SourceDrawer } from '@pi/domain'
import { ScheduleCard } from './ScheduleCard'
import styles from './Monitoring.module.css'

function AssignControl({ alertId, current }: { alertId: string; current: string | null }) {
  const { role } = useCurrentUser()
  const assign = useAssignAlert()
  const [who, setWho] = useState<string>(ROLES[0]?.label ?? '')
  const allowed = can(role, 'assign_alerts')
  return (
    <span className={styles.assign}>
      <Select aria-label="Assign to" className="w-44" value={who} onValueChange={setWho} disabled={!allowed} options={ROLES.map((r) => ({ value: r.label, label: r.label }))} />{' '}
      <Button onClick={() => assign.mutate({ id: alertId, assignee: who })} disabledReason={allowed ? undefined : whyDisabled('assign_alerts')}>{current ? 'Reassign' : 'Assign'}</Button>
    </span>
  )
}

interface ChartPoint { x: number; y: number; label: string; date: string }

const W = 720, H = 340, PAD = { left: 56, right: 20, top: 16, bottom: 52 }
const TICKS = [0, 25, 50, 75, 100]
const px = (v: number) => PAD.left + (v / 100) * (W - PAD.left - PAD.right)
const py = (v: number) => H - PAD.bottom - (v / 100) * (H - PAD.top - PAD.bottom)

/** Time elapsed (x) against disbursed (y), one point per supervision report. Hover, touch or tab to a point to read it. */
function DisbursementChart({ points }: { points: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const lag = THRESHOLDS.disbursementLagPoints
  const last = points.length - 1
  const current = active === null ? undefined : points[active]

  // The tip follows the pointer and sits below it, so the pointer never covers what it reads.
  const nearest = (clientX: number, clientY: number, box: DOMRect) => {
    const x = ((clientX - box.left) / box.width) * W
    let best = 0
    points.forEach((p, i) => { if (Math.abs(px(p.x) - x) < Math.abs(px(points[best]?.x ?? 0) - x)) best = i })
    setActive(best)
    const outer = wrap.current?.getBoundingClientRect()
    if (outer) setPos({ left: clientX - outer.left, top: clientY - outer.top })
  }
  // Keyboard focus has no pointer, so anchor the tip under the focused point.
  const focusPoint = (i: number, svg: SVGSVGElement | null) => {
    const p = points[i], outer = wrap.current?.getBoundingClientRect(), box = svg?.getBoundingClientRect()
    setActive(i)
    if (p && outer && box) setPos({ left: box.left - outer.left + (px(p.x) / W) * box.width, top: box.top - outer.top + (py(p.y) / H) * box.height })
  }
  const leave = () => { setActive(null); setPos(null) }
  const svgRef = useRef<SVGSVGElement>(null)
  const tipWidth = 210
  const outerWidth = wrap.current?.getBoundingClientRect().width ?? 0

  return (
    <div className={styles.chart} ref={wrap}>
      <svg
        ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Disbursement versus time elapsed, one point per supervision report" width="100%"
        onMouseMove={(e) => nearest(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={leave}
      >
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={px(0)} x2={px(100)} y1={py(t)} y2={py(t)} className={styles.grid} />
            <line x1={px(t)} x2={px(t)} y1={py(0)} y2={py(100)} className={styles.grid} />
            <text x={PAD.left - 8} y={py(t) + 4} textAnchor="end" className={styles.tick}>{t}%</text>
            <text x={px(t)} y={H - PAD.bottom + 18} textAnchor="middle" className={styles.tick}>{t}%</text>
          </g>
        ))}
        <text transform={`translate(14 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle" className={styles.axisTitle}>Disbursed (%)</text>
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 8} textAnchor="middle" className={styles.axisTitle}>Time elapsed (% of the period from effectiveness to closing)</text>

        <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)} className={styles.onPace} />
        <text x={px(45)} y={py(53)} textAnchor="end" className={styles.tick}>On pace</text>
        <line x1={px(lag)} y1={py(0)} x2={px(100)} y2={py(100 - lag)} className={styles.alertLine} />
        <text x={px(64)} y={py(30)} className={styles.alertText}>Alert line: {lag} points behind</text>

        <polyline fill="none" className={styles.series} points={points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />

        {current && (
          <g className={styles.cross}>
            <line x1={px(current.x)} x2={px(current.x)} y1={py(0)} y2={py(current.y)} />
            <line x1={px(0)} x2={px(current.x)} y1={py(current.y)} y2={py(current.y)} />
          </g>
        )}
        {points.map((p, i) => (
          <circle
            key={p.label} cx={px(p.x)} cy={py(p.y)} r={i === active ? 7 : i === last ? 5.5 : 4}
            className={i === last ? styles.latestDot : styles.dot} tabIndex={0}
            aria-label={`${p.label}, ${p.date}: ${p.y}% disbursed at ${p.x}% of time elapsed`}
            onFocus={() => focusPoint(i, svgRef.current)} onBlur={leave}
            onTouchStart={() => focusPoint(i, svgRef.current)}
          />
        ))}
        {last >= 0 && points[last] && <text x={px(points[last].x) + 10} y={py(points[last].y) + 4} className={styles.alertText}>Latest report</text>}
      </svg>

      {current && pos && (
        <div
          className={styles.tip} role="status"
          style={{ left: Math.min(Math.max(pos.left, tipWidth / 2), Math.max(outerWidth - tipWidth / 2, tipWidth / 2)), top: pos.top, transform: 'translate(-50%, 22px)' }}
        >
          <strong>{current.label}</strong> <span className="mono">{current.date}</span>
          <div>Disbursed: <span className="mono">{current.y}%</span></div>
          <div>Time elapsed: <span className="mono">{current.x}%</span></div>
          <div>Gap: <span className="mono">{current.y - current.x} points</span> {current.x - current.y > lag ? '(past the alert line)' : current.y >= current.x ? '(on or ahead of pace)' : '(behind pace)'}</div>
        </div>
      )}
      <p className={styles.sub}>Move the pointer over the chart, or tab to a point, to read each report. Points below the red line are more than {lag} points behind pace.</p>
    </div>
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
  const [showAllAlerts, setShowAllAlerts] = useState(false)

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
  const points = [...reports].sort((a, b) => a.sequence - b.sequence).map((r) => ({ x: timeElapsedPct(project, r.date), y: r.disbursed_pct, label: `ISR ${r.sequence}`, date: r.date }))
  const count = (signal: string) => alerts.filter((a) => a.signal === signal).length
  // Urgent (high) alerts first; the rest on request. With no urgent alert there is nothing to hide the others behind.
  const urgent = alerts.filter((a) => a.severity === 'high')
  const listAll = showAllAlerts || urgent.length === 0
  const shown = listAll ? alerts : urgent
  const govLatest = [...gov].sort((a, b) => b.year - a.year)[0]

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Execution and monitoring</h1>
        <p>Warning signals from supervision reports and from the contract data your team enters, ranked by severity. Latest data as of {asOf}.</p>
      </div>

      <Carousel ariaLabel="Key figures">
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
      </Carousel>

      <Card title="Disbursement vs. time elapsed" aside={<ProvenanceChip kind="public" detail="one point per report" />}>
        {points.length < 2 ? <EmptyState title="Needs at least 2 supervision reports" text={`${points.length} available.`} /> : <DisbursementChart points={points} />}
      </Card>

      <ScheduleCard project={project} />

      <Card title="Early-warning board" aside={<span className={styles.sub}>every flag shows where it comes from</span>}>
        {alerts.length === 0 ? <EmptyState title="No alerts for this selection" text="Signals appear when supervision ratings change or approved entered data crosses a rule." /> : (
          <>
            <div className={styles.alertBar}>
              <span className={styles.sub} role="status">
                {urgent.length === 0 ? `No urgent alerts. Showing all ${alerts.length}.` : listAll ? `Showing all ${alerts.length} alerts, urgent first. Scroll for the rest.` : `Showing ${urgent.length} urgent ${urgent.length === 1 ? 'alert' : 'alerts'} of ${alerts.length}.`}
              </span>
              {urgent.length > 0 && alerts.length > urgent.length && (
                <Button onClick={() => setShowAllAlerts(!showAllAlerts)} aria-expanded={showAllAlerts}>{showAllAlerts ? 'Show urgent only' : `Show all ${alerts.length}`}</Button>
              )}
            </div>
            <div className={listAll ? styles.alertScroll : undefined} role={listAll ? 'region' : undefined} tabIndex={listAll ? 0 : undefined} aria-label={listAll ? 'Alerts. Scroll to see all of them.' : undefined}>
              {shown.map((a) => (
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
            </div>
          </>
        )}
      </Card>

      <div className={styles.two}>
        <Card title="Project key dates" aside={<ProvenanceChip kind="public" />}>
          <TableScroll><table className={styles.table}>
            <thead><tr><th>Milestone</th><th>Planned</th><th>Actual or revised</th></tr></thead>
            <tbody>
              <tr><td>Approval</td><td className="mono">{project.approval_date}</td><td className="mono">{project.approval_date}</td></tr>
              <tr><td>Effectiveness</td><td className="mono">{project.effectiveness_planned}</td><td className="mono">{project.effectiveness_actual ?? '—'}</td></tr>
              <tr><td>Closing</td><td className="mono">{project.closing_date_planned}</td><td className="mono">{project.closing_date_revised ?? '—'}</td></tr>
            </tbody>
          </table></TableScroll>
        </Card>
        <Card title="Governance context" aside={<ProvenanceChip kind="public" />}>
          {govLatest ? (
            <TableScroll><table className={styles.table}><tbody>
              {Object.entries(govLatest.wgi).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="mono">{v}</td><td><ProvenanceChip kind="public" detail={`WGI ${govLatest.year}`} /></td></tr>)}
              <tr><td>Transparency and accountability (CPIA 16)</td><td className="mono">{govLatest.cpia_16 ?? <ProvenanceChip kind="missing" detail="not covered" />}</td><td /></tr>
            </tbody></table></TableScroll>
          ) : <EmptyState title="No governance data for this country" />}
        </Card>
      </div>
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
