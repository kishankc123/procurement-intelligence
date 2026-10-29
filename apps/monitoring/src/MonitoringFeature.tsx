import { useProject } from '@pi/data'
import { Card } from '@pi/ui'
import { DisbursementCard, EarlyWarningCard } from './Monitoring'
import { ScheduleCard } from './ScheduleCard'

export type MonitoringFeatureId = 'disbursement-chart' | 'project-schedule' | 'early-warning'

/**
 * One monitoring feature as its own card: the disbursement against time chart, the project schedule or the early-warning board. The same components the
 * Monitoring stage is made of, exposed one at a time so the shell can show a single feature (for example one a user picked for their own lifecycle).
 */
export default function MonitoringFeature({ feature, projectId }: { feature: MonitoringFeatureId; projectId: string }) {
  const project = useProject(projectId).data?.[0]
  if (feature === 'disbursement-chart') return <DisbursementCard projectId={projectId} />
  if (feature === 'early-warning') return <EarlyWarningCard projectId={projectId} />
  if (!project) return <Card state="loading">{null}</Card>
  return <ScheduleCard project={project} />
}
