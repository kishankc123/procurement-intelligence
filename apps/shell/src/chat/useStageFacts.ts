import { useFeedback, usePlan, useReports, useTenderDraft } from '@pi/data'
import type { Provenance } from '@pi/ui'
import type { LifecycleStage } from '@pi/data'

export interface StageFact { text: string; kind: Provenance }

/** What the project has for each lifecycle stage, read live from the same data as the stage cards, so a zero shows as Missing. */
export function useStageFacts(projectId: string): Record<LifecycleStage, StageFact> {
  const plans = usePlan(projectId).data ?? []
  const draft = useTenderDraft(projectId).data ?? []
  const reports = useReports(projectId).data ?? []
  const feedback = useFeedback().data ?? []
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
  return {
    planning: plans.length > 0
      ? { text: `${n(plans.length, 'plan')} entered for this project.`, kind: 'entered' }
      : { text: 'No plans yet. Add one in Planning.', kind: 'missing' },
    'tender-design': draft.length > 0
      ? { text: 'Draft clauses saved for this project.', kind: 'entered' }
      : { text: 'No draft yet. Start one in Tender design.', kind: 'missing' },
    monitoring: reports.length > 0
      ? { text: `${n(reports.length, 'supervision report')} on file.`, kind: 'public' }
      : { text: 'No supervision reports for this project.', kind: 'missing' },
    learning: feedback.length > 0
      ? { text: `${n(feedback.length, 'feedback entry', 'feedback entries')} recorded.`, kind: 'entered' }
      : { text: 'No feedback yet. Mark an answer Helpful or Not helpful.', kind: 'missing' },
  }
}
