// Pure helper for the Planning agenda: the four tender stages of a plan with the gaps between them. No React.
import { dayDiff } from './selectors'
import type { Plan } from './schemas'

export type StageId = 'advertisement' | 'bid_opening' | 'evaluation_complete' | 'contract_signing'

export interface PlanStage {
  id: StageId
  label: string
  date: string
  /** Days since the previous stage; null for the first. Negative when the dates are out of order. */
  daysSincePrevious: number | null
  /** Days from the date of the data to this stage: negative is past, positive is ahead. */
  daysFromAsOf: number
}

export interface PlanStages {
  stages: PlanStage[]
  /** Advertisement to contract signing. */
  totalDays: number
  /** True when any stage is dated before the one before it. */
  outOfOrder: boolean
}

export function planStages(plan: Plan, asOf: string): PlanStages {
  const raw: { id: StageId; label: string; date: string }[] = [
    { id: 'advertisement', label: 'Advertisement', date: plan.planned_advertisement },
    { id: 'bid_opening', label: 'Bid opening', date: plan.planned_bid_opening },
    { id: 'evaluation_complete', label: 'Evaluation complete', date: plan.planned_evaluation_complete },
    { id: 'contract_signing', label: 'Contract signing', date: plan.planned_signing },
  ]
  const stages = raw.map((s, i): PlanStage => ({
    ...s,
    daysSincePrevious: i === 0 ? null : dayDiff((raw[i - 1] as { date: string }).date, s.date),
    daysFromAsOf: dayDiff(asOf, s.date),
  }))
  return { stages, totalDays: dayDiff(plan.planned_advertisement, plan.planned_signing), outOfOrder: stages.some((s) => s.daysSincePrevious !== null && s.daysSincePrevious < 0) }
}
