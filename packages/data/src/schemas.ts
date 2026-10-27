import { z } from 'zod'

export const Provenance = z.enum(['public', 'entered', 'derived', 'missing'])
export type Provenance = z.infer<typeof Provenance>

const date = z.string() // ISO yyyy-mm-dd

export const Project = z.object({
  project_id: z.string(),
  project_name: z.string(),
  borrower_country: z.string(),
  borrower_country_code: z.string(), // ISO alpha-2, matches country_years.country
  region: z.string(),
  project_global_practice: z.string(),
  closing_date_planned: date,
  closing_date_revised: date.nullable(),
  effectiveness_planned: date,
  effectiveness_actual: date.nullable(),
  approval_date: date,
})
export type Project = z.infer<typeof Project>

export const Contract = z.object({
  borrower_contract_reference_number: z.string(),
  wb_contract_number: z.string(),
  project_id: z.string(),
  supplier: z.string(),
  supplier_id: z.string(),
  supplier_country: z.string(),
  procurement_category: z.string(),
  procurement_method: z.string(),
  review_type: z.string(),
  supplier_contract_amount_usd: z.number(),
  contract_signing_date: date,
  fiscal_year: z.number(),
  contract_description: z.string(),
})
export type Contract = z.infer<typeof Contract>

export const ENRICHMENT_FIELDS = [
  'advertised_date', 'bids_opened_date', 'bidders_received', 'bidders_qualified', 'bid_validity_days', 'contract_end_date',
] as const
export const EnrichmentField = z.enum(ENRICHMENT_FIELDS)
export type EnrichmentField = z.infer<typeof EnrichmentField>

export const Status = z.enum(['pending', 'approved', 'rejected'])
export const RoleSchema = z.enum(['planner', 'contract_manager', 'reviewer', 'admin'])

export const Enrichment = z.object({
  id: z.string(),
  contract_ref: z.string(),
  field: EnrichmentField,
  value: z.string(),
  entered_by_role: RoleSchema,
  fiscal_year: z.number(),
  status: Status,
  source_note: z.string(),
  entered_at: z.string(),
})
export type Enrichment = z.infer<typeof Enrichment>

export const Amendment = z.object({
  id: z.string(),
  contract_ref: z.string(),
  type: z.string(),
  date,
  days_added: z.number(),
  value_change_usd: z.number(),
  reason: z.string(),
  status: Status,
  entered_by_role: RoleSchema,
})
export type Amendment = z.infer<typeof Amendment>

export const Plan = z.object({
  id: z.string(),
  project_id: z.string(),
  planned_advertisement: date,
  planned_bid_opening: date,
  planned_evaluation_complete: date,
  planned_signing: date,
  category: z.string(),
  method: z.string(),
})
export type Plan = z.infer<typeof Plan>

export const TenderDraft = z.object({
  id: z.string(),
  project_id: z.string(),
  duration_months: z.number(),
  bid_validity_days: z.number(),
  performance_security_pct: z.number(),
  min_similar_contracts: z.number(),
  min_similar_value_usd: z.number(),
  evaluation_method: z.string(),
})
export type TenderDraft = z.infer<typeof TenderDraft>

const Rating = z.enum(['HS', 'S', 'MS', 'MU', 'U', 'HU'])
export type Rating = z.infer<typeof Rating>

export const SupervisionReport = z.object({
  id: z.string(),
  project_id: z.string(),
  sequence: z.number(),
  date,
  progress_rating_prev: Rating.nullable(),
  progress_rating: Rating,
  implementation_rating: Rating,
  overall_risk_prev: z.string().nullable(),
  overall_risk: z.string(),
  fiduciary_risk: z.string(),
  disbursed_pct: z.number(),
  restructurings: z.array(z.object({ date, note: z.string() })),
})
export type SupervisionReport = z.infer<typeof SupervisionReport>

export const CompletionReport = z.object({
  id: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  outcome_rating: z.string(),
  restructurings: z.number(),
  closing_extension_months: z.number(),
  lessons: z.array(z.object({ section: z.string(), text: z.string(), chunk_id: z.string() })),
})
export type CompletionReport = z.infer<typeof CompletionReport>

export const Doc = z.object({
  doc_id: z.string(), project_id: z.string(), type: z.string(), title: z.string(),
  date, pages: z.number(), parse_status: z.string(),
})
export type Doc = z.infer<typeof Doc>

export const Chunk = z.object({
  chunk_id: z.string(), doc_id: z.string(), page: z.number(), section_path: z.string(),
  strategy: z.string(), token_count: z.number(), text: z.string(), embedding_status: z.string(),
})
export type Chunk = z.infer<typeof Chunk>

export const CountryYear = z.object({
  id: z.string(),
  country: z.string(),
  year: z.number(),
  indicators: z.record(z.string(), z.number().nullable()),
  completeness: z.number(),
  flags: z.array(z.string()),
})
export type CountryYear = z.infer<typeof CountryYear>

export const Governance = z.object({
  id: z.string(), country: z.string(), year: z.number(),
  wgi: z.record(z.string(), z.number()),
  cpia_16: z.number().nullable(),
})
export type Governance = z.infer<typeof Governance>

// A citation points at a document chunk or at an entered record (collection + id).
export const Citation = z.object({ ref_type: z.enum(['chunk', 'record']), ref_id: z.string(), label: z.string() })
export type Citation = z.infer<typeof Citation>

export const Recommendation = z.object({
  id: z.string(),
  project_id: z.string(),
  kind: z.enum(['finding', 'lesson', 'withheld']),
  title: z.string(),
  text: z.string(),
  citations: z.array(Citation),
})
export type Recommendation = z.infer<typeof Recommendation>

export const AlertState = z.object({
  id: z.string(), assignee: z.string().nullable(), status: z.enum(['open', 'assigned']),
})
export type AlertState = z.infer<typeof AlertState>

export const Feedback = z.object({
  id: z.string(),
  target_id: z.string(),
  rating: z.enum(['helpful', 'not_helpful']),
  reason: z.string(),
  role: RoleSchema,
  status: z.enum(['new', 'accepted', 'rejected', 'edited']),
  created_at: z.string(),
})
export type Feedback = z.infer<typeof Feedback>

export const AuditEvent = z.object({
  id: z.string(), at: z.string(), role: RoleSchema, action: z.string(), target: z.string(),
})
export type AuditEvent = z.infer<typeof AuditEvent>

export const Meta = z.object({ dataset_label: z.string(), as_of_date: date })
export type Meta = z.infer<typeof Meta>

export const Source = z.object({
  id: z.string(), name: z.string(), publisher: z.string(), kind: z.string(),
  status: z.enum(['registered', 'fetched']), last_fetched: date.nullable(), simulated: z.boolean(),
})
export type Source = z.infer<typeof Source>

const ConflictSide = z.object({ label: z.string(), value: z.string(), provenance: Provenance, citation: Citation })
export const Conflict = z.object({
  id: z.string(), project_id: z.string(), type: z.string(), subject: z.string(),
  left: ConflictSide, right: ConflictSide, rule_applied: z.string(),
  status: z.enum(['open', 'resolved']), resolution: z.string().nullable(),
  // Entered record to reject if the reviewer keeps the public value.
  entered_ref: z.string(),
})
export type Conflict = z.infer<typeof Conflict>
