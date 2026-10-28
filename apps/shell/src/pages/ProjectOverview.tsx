import { lazy, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  dataReadiness, plannedDurations, projectPhase, scheduleRows, useContracts, useEnrichments, useMeta, usePlan,
  useProject, useScheduleItems, useTenderDraft, useUiStore,
} from '@pi/data'
import { Badge, Card, EmptyState, ProvenanceChip, StackedBars, TableScroll } from '@pi/ui'
import { RemoteBoundary } from '../RemoteBoundary'
import styles from './ProjectOverview.module.css'

// The same schedule card Monitoring shows (Gantt chart), loaded from the Monitoring remote.
const ScheduleCard = lazy(() => import('monitoring/ScheduleCard'))

/** One lifecycle section of the project: labelled with where it comes from, with a link to the full page. */
function Section({ from, title, to, children, aside }: { from: string; title: string; to: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card title={title} aside={<span className={styles.row}>{aside}<Badge>From {from}</Badge></span>}>
      <div className={styles.stack}>
        {children}
        <div className={styles.more}><Link to={to}>View more in {from} →</Link></div>
      </div>
    </Card>
  )
}

export function ProjectOverview() {
  const { projectId, fiscalYear } = useUiStore()
  const project = useProject(projectId).data?.[0]
  const plans = usePlan(projectId).data ?? []
  const draft = useTenderDraft(projectId).data?.[0]
  const items = useScheduleItems().data ?? []
  const asOf = useMeta().data?.as_of_date
  const contracts = (useContracts(projectId).data ?? []).filter((c) => c.fiscal_year === fiscalYear)
  const enrichments = useEnrichments().data ?? []

  if (!project || !asOf) return <Card state="loading">{null}</Card>

  const rows = scheduleRows(items.filter((i) => i.project_id === projectId), plans, asOf)
  const readiness = dataReadiness(contracts, enrichments)

  return (
    <div className={styles.page}>
      <div>
        <h1>{project.project_name}</h1>
        <p className={styles.sub}><span className="mono">{project.project_id}</span> · {project.borrower_country} · {project.project_global_practice} · {project.region}</p>
      </div>

      <Card title="Project" aside={<ProvenanceChip kind="public" />}>
        <dl className={styles.facts}>
          <div><dt>Approval</dt><dd className="mono">{project.approval_date}</dd></div>
          <div><dt>Effectiveness</dt><dd className="mono">{project.effectiveness_actual ?? project.effectiveness_planned}{project.effectiveness_actual ? '' : ' (planned)'}</dd></div>
          <div><dt>Closing</dt><dd className="mono">{project.closing_date_revised ?? project.closing_date_planned}{project.closing_date_revised ? ' (revised)' : ''}</dd></div>
          <div><dt>Phase</dt><dd>{projectPhase(project, rows, asOf)}</dd></div>
        </dl>
      </Card>

      <Section from="Planning" title="Plans" to="/planning" aside={<ProvenanceChip kind="entered" />}>
        {plans.length === 0 ? <EmptyState title="No plans yet" text="Plans for this project are entered in Planning." /> : (
          <TableScroll>
            <table className={styles.table}>
              <thead><tr><th>Plan</th><th>Category</th><th>Method</th><th>Advertisement</th><th>Signing</th><th>Days to sign</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}<br /><span className="mono">{p.id}</span></td><td>{p.category}</td><td>{p.method}</td>
                    <td className="mono">{p.planned_advertisement}</td><td className="mono">{p.planned_signing}</td><td className="mono">{plannedDurations(p).advertisementToSigning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      <Section from="Tender design" title="Draft clauses" to="/tender-design" aside={<ProvenanceChip kind="entered" />}>
        {!draft ? <EmptyState title="No tender draft yet" text="Clauses are entered in Tender design once a draft exists." /> : (
          <dl className={styles.facts}>
            <div><dt>Contract duration</dt><dd className="mono">{draft.duration_months} months</dd></div>
            <div><dt>Bid validity</dt><dd className="mono">{draft.bid_validity_days} days</dd></div>
            <div><dt>Performance security</dt><dd className="mono">{draft.performance_security_pct}%</dd></div>
            <div><dt>Minimum similar contracts</dt><dd className="mono">{draft.min_similar_contracts}</dd></div>
            <div><dt>Minimum similar value</dt><dd className="mono">{draft.min_similar_value_usd.toLocaleString('en-US')} USD</dd></div>
            <div><dt>Evaluation method</dt><dd>{draft.evaluation_method}</dd></div>
          </dl>
        )}
      </Section>

      <RemoteBoundary name="Project schedule">
        <ScheduleCard
          project={project}
          badge={<Badge>From Monitoring</Badge>}
          footer={<div className={styles.more}><Link to="/monitoring">View more in Monitoring →</Link></div>}
        />
      </RemoteBoundary>

      <Section from="Learning" title="Contract data readiness" to="/learning" aside={<ProvenanceChip kind="derived" detail={`n=${readiness.eligible}`} />}>
        {readiness.eligible === 0 ? <EmptyState title={`No contracts in FY${fiscalYear}`} text="Readiness counts the contracts of this project in the selected fiscal year." /> : (
          <>
            <p className={styles.sub}>{readiness.eligible} contracts in FY{fiscalYear}: how many have a usable value for the fields Tender design and Monitoring read.</p>
            <StackedBars
              title="Contract data readiness" total={readiness.eligible} unit="contracts"
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
          </>
        )}
      </Section>
    </div>
  )
}
