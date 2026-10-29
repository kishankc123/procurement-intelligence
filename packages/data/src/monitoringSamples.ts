// Sample rows for the monitoring features a user adds to their own lifecycle. A user's own project has no schedule items or alerts yet, and a stored project may
// have only one of each, which does not show what the Gantt chart or the early-warning board can do. These rows fill the gap: each is labelled Sample, carries no
// invented figure beyond a mock progress input, and is built from the as-of date so its status (on track, behind, overdue) never drifts.
import { dayDiff, type DerivedAlert } from './selectors'
import type { ScheduleItem } from './schemas'

export const SAMPLE_PREFIX = 'SAMPLE-'
export const isSampleId = (id: string) => id.startsWith(SAMPLE_PREFIX)

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Three schedule items: one on track, one behind, one overdue, so the chart shows each status. Progress values are mock inputs. */
export function sampleScheduleItems(projectId: string, asOf: string): ScheduleItem[] {
  const item = (n: number, name: string, group: ScheduleItem['group'], from: number, to: number, progress: number): ScheduleItem =>
    ({ id: `${SAMPLE_PREFIX}SCH-${n}`, project_id: projectId, name: `Sample: ${name}`, group, start: addDays(asOf, from), end: addDays(asOf, to), progress_pct: progress })
  return [
    item(1, 'Culvert works', 'Works', -120, 120, 50),
    item(2, 'Signage supply', 'Supplies', -150, 60, 30),
    item(3, 'Site supervision staff', 'Manpower', -300, -30, 85),
  ]
}

/**
 * Three alerts, one per severity, so the board shows urgent first, Show all, evidence and Assign. They cite the project's latest supervision report so the evidence
 * drawer has a real record to open; with no report there is nothing to cite, so no sample is made.
 */
export function sampleAlerts(projectId: string, latestReport: { id: string; sequence: number } | undefined): DerivedAlert[] {
  if (!latestReport) return []
  const citations = [{ ref_type: 'record' as const, ref_id: latestReport.id, label: `Sample · ISR ${latestReport.sequence}` }]
  const alert = (n: number, severity: DerivedAlert['severity'], signal: DerivedAlert['signal'], title: string, text: string, provenance: DerivedAlert['provenance']): DerivedAlert =>
    ({ id: `${SAMPLE_PREFIX}ALR-${n}`, project_id: projectId, severity, signal, title: `Sample: ${title}`, text: `${text} This is a sample of how the signal looks; your own project's signal appears when its data is added.`, provenance, citations, assignee: null })
  return [
    alert(1, 'high', 'disbursement_lag', 'Disbursement behind time elapsed', 'An urgent signal: the gap between percent disbursed and percent of time used is above the alert line.', 'derived'),
    alert(2, 'medium', 'contract_past_end', 'Contract past its end date', 'A contract has an approved end date in the past and no completion recorded.', 'entered'),
    alert(3, 'low', 'amendment', 'Contract amendment recorded', 'An approved amendment extended a contract; shown so it can be reviewed with the others.', 'entered'),
  ]
}

/** Days between two sample dates; exported so tests can check the statuses the sample is built to show. */
export const sampleSpan = (item: Pick<ScheduleItem, 'start' | 'end'>) => dayDiff(item.start, item.end)
