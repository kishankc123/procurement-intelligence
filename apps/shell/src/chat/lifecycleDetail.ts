import { z } from 'zod'

// What each kind of lifecycle item stores in `detail`. Read with these so a malformed item is skipped, not drawn wrongly.
export const PlanDetail = z.object({
  plan: z.object({ name: z.string(), category: z.string(), method: z.string(), planned_advertisement: z.string(), planned_bid_opening: z.string(), planned_evaluation_complete: z.string(), planned_signing: z.string() }),
  basis: z.object({ sample_size: z.number(), projects: z.array(z.string()), median_total_days: z.number(), filtered_by: z.string() }),
})
export const ClausesDetail = z.object({ clauses: z.array(z.object({ label: z.string(), unit: z.string(), value: z.union([z.number(), z.string()]), source: z.enum(['real', 'mock']).optional() })) })
export const RowsDetail = z.object({ rows: z.array(z.object({ metric: z.string(), unit: z.string(), value: z.union([z.number(), z.string()]).nullable(), n: z.number(), counts: z.string(), thin: z.boolean() })) })
export const TimelineDetail = z.object({
  completion: z.string(), assumed: z.boolean(), notes: z.array(z.string()), overrun: z.boolean(),
  milestones: z.array(z.object({ id: z.enum(['approval', 'effectiveness', 'advertisement', 'bid_opening', 'evaluation_complete', 'contract_signing', 'completion']), label: z.string(), date: z.string(), how: z.string() })),
})
export const FeatureDetail = z.object({ id: z.string() })
