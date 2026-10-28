// Pure helpers for the Tender design charts. No React.
import { dayDiff } from './selectors'
import type { ComparisonRow, Tone } from './selectors'
import type { SpecCheck, SpecStatus } from './spec'
import type { Citation, Plan, TenderDraft } from './schemas'

export type GlanceTone = 'good' | 'attention' | 'bad' | 'neutral'

/** One draft-versus-reference pair that can be drawn as two bars. */
export interface GlanceRow {
  id: string
  label: string
  draft: number
  reference: number
  unit: string
  /** What the reference is, e.g. "Your plan" or "Entered contracts (median)". */
  referenceLabel: string
  tone: GlanceTone
  /** What the result means, in words: shown on demand next to the bars. */
  meaning: string
  /** How the reference was worked out. */
  basis: string
  citations: Citation[]
}

/** A clause that cannot be drawn yet, with the reason; `canAdd` is true when entering contract data would fix it. */
export interface GlanceGap {
  id: string
  label: string
  referenceLabel: string
  reason: string
  canAdd: boolean
}

const COMPARISON_TONE: Record<Tone, GlanceTone> = { ok: 'good', attention: 'attention', info: 'neutral' }
const SPEC_TONE: Record<SpecStatus, GlanceTone> = { pass: 'good', warn: 'attention', fail: 'bad', not_checkable: 'neutral' }

/**
 * Every draft-versus-reference pair that has two real numbers: comparisons with the plan or with contract data
 * (only once their sample gate is met) and the specification checks that compare two numbers.
 * A clause with no number to compare is not drawn, so nothing is estimated for the chart.
 */
export function glanceRows(comparisons: ComparisonRow[], checks: SpecCheck[]): GlanceRow[] {
  const rows: GlanceRow[] = []
  for (const r of comparisons) {
    for (const c of r.comparisons) {
      if (c.numeric) rows.push({ id: `${r.id}:${c.against}`, label: r.label, ...c.numeric, referenceLabel: c.against, tone: c.verdict ? COMPARISON_TONE[c.verdict.tone] : 'neutral', meaning: c.verdict?.text ?? '', basis: c.basis, citations: c.citations })
    }
  }
  for (const c of checks) {
    if (c.numeric) rows.push({ id: `spec:${c.id}`, label: c.clause, ...c.numeric, referenceLabel: c.reference ?? 'Reference', tone: SPEC_TONE[c.status], meaning: c.detail, basis: c.rule, citations: c.citations })
  }
  return rows
}

/**
 * Comparisons that cannot be drawn: too few contracts have the value (more data fixes it), or no source holds it (nothing does).
 * Drawn as blank rows so the clause is still visible and says what is missing.
 */
export function glanceGaps(comparisons: ComparisonRow[]): GlanceGap[] {
  const gaps: GlanceGap[] = []
  for (const r of comparisons) {
    for (const c of r.comparisons) {
      if (c.numeric) continue
      if (c.gated) gaps.push({ id: `${r.id}:${c.against}`, label: r.label, referenceLabel: c.against, reason: `Needs ${c.gated.required} contracts with this value. ${c.gated.n} so far.`, canAdd: true })
      else if (c.missing) gaps.push({ id: `${r.id}:${c.against}`, label: r.label, referenceLabel: c.against, reason: c.missing, canAdd: false })
    }
  }
  return gaps
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface ValidityCoverage {
  opening: string
  signing: string
  /** Days from bid opening to planned signing: how long bids must stay valid. */
  needed: number
  validityDays: number
  /** The last day bids are valid, counting from bid opening. */
  validityEnd: string
  /** Days by which bids expire before signing; 0 when covered. */
  shortBy: number
  /** Days of validity left after signing; 0 when not covered or exact. */
  spare: number
}

export function validityCoverage(plan: Plan, draft: Pick<TenderDraft, 'bid_validity_days'>): ValidityCoverage {
  const needed = dayDiff(plan.planned_bid_opening, plan.planned_signing)
  return {
    opening: plan.planned_bid_opening, signing: plan.planned_signing, needed, validityDays: draft.bid_validity_days,
    validityEnd: addDays(plan.planned_bid_opening, draft.bid_validity_days),
    shortBy: Math.max(needed - draft.bid_validity_days, 0), spare: Math.max(draft.bid_validity_days - needed, 0),
  }
}
