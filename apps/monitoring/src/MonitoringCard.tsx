import { THRESHOLDS } from '@pi/config'
import { deriveAlerts, timeElapsedPct, useAlertStates, useAmendments, useContracts, useEnrichments, useMeta, useProject, useReports, useUiStore } from '@pi/data'
import { Card, ProvenanceChip } from '@pi/ui'
import { DisbursementCard, EarlyWarningCard } from './Monitoring'
import { ScheduleCard } from './ScheduleCard'
import styles from './Monitoring.module.css'

/**
 * The Monitoring stage as a card for the chat: one sentence on where the project stands, then the disbursement chart,
 * the project schedule and the early-warning board. The same cards as the Monitoring page, without the page around them.
 */
export default function MonitoringCard({ projectId }: { projectId: string }) {
  const fiscalYear = useUiStore((s) => s.fiscalYear)
  const project = useProject(projectId).data?.[0]
  const reports = useReports(projectId).data ?? []
  const contracts = useContracts(projectId, fiscalYear).data ?? []
  const enrichments = useEnrichments().data ?? []
  const amendments = useAmendments().data ?? []
  const states = useAlertStates().data ?? []
  const asOf = useMeta().data?.as_of_date
  if (!project || !asOf) return <Card state="loading">{null}</Card>

  const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
  const alerts = deriveAlerts({ project, reports, contracts, enrichments: enrichments.filter((e) => refs.has(e.contract_ref)), amendments: amendments.filter((a) => refs.has(a.contract_ref)), states, asOf })
  const urgent = alerts.filter((a) => a.severity === 'high').length
  const latest = [...reports].sort((a, b) => b.sequence - a.sequence)[0]
  const gap = latest ? timeElapsedPct(project, latest.date) - latest.disbursed_pct : null

  return (
    <div className={styles.chatCard}>
      <p className={styles.chatSummary}>
        {reports.length === 0
          ? <>There are no supervision reports for {project.project_name}, so there is no disbursement history to show.</>
          : <>
            <strong>{alerts.length} {alerts.length === 1 ? 'warning signal' : 'warning signals'}</strong> for {project.project_name}, {urgent} urgent.
            {latest && gap !== null && <> The latest report ({latest.date}) shows {latest.disbursed_pct}% disbursed, {gap > 0 ? `${gap} points behind` : `${-gap} points ahead of`} the time elapsed; the alert line is {THRESHOLDS.disbursementLagPoints} points.</>}
          </>}
        {' '}<ProvenanceChip kind="derived" detail={`n=${reports.length} reports`} />
      </p>
      <DisbursementCard projectId={projectId} />
      <ScheduleCard project={project} />
      <EarlyWarningCard projectId={projectId} />
    </div>
  )
}
