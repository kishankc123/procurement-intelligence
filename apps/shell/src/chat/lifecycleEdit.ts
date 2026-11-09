// Editing the plan and the tender clauses in the user's own lifecycle. They start as the application's suggestion and the user may change them, by hand
// (the edit forms) or by command (the chat tool). Both go through these pure functions so the same checks apply: a date must be a real date, the four
// planned dates stay in order, a number clause takes a number. A change that fails a check is refused with a sentence the user can act on, not applied.
import { datePlanningEstimates, type DatedMilestone, type DatedPlanning, type LifecycleEdit, type LifecycleItem } from '@pi/data'

export const PLAN_FIELDS = {
  name: 'Plan name', category: 'Category', method: 'Method',
  planned_advertisement: 'Advertisement', planned_bid_opening: 'Bid opening', planned_evaluation_complete: 'Evaluation complete', planned_signing: 'Signing',
} as const
export type PlanField = keyof typeof PLAN_FIELDS
const DATE_FIELDS: PlanField[] = ['planned_advertisement', 'planned_bid_opening', 'planned_evaluation_complete', 'planned_signing']

/** Words a user or the model might use for a plan field, mapped to the field. */
const PLAN_ALIASES: Record<string, PlanField> = {
  name: 'name', title: 'name', category: 'category', method: 'method', 'procurement method': 'method',
  advertisement: 'planned_advertisement', advertise: 'planned_advertisement', advertising: 'planned_advertisement', planned_advertisement: 'planned_advertisement', 'advertisement date': 'planned_advertisement',
  'bid opening': 'planned_bid_opening', bid_opening: 'planned_bid_opening', planned_bid_opening: 'planned_bid_opening', opening: 'planned_bid_opening', 'bid opening date': 'planned_bid_opening',
  evaluation: 'planned_evaluation_complete', 'evaluation complete': 'planned_evaluation_complete', evaluation_complete: 'planned_evaluation_complete', planned_evaluation_complete: 'planned_evaluation_complete', 'evaluation end': 'planned_evaluation_complete',
  signing: 'planned_signing', signature: 'planned_signing', planned_signing: 'planned_signing', 'contract signing': 'planned_signing', 'signing date': 'planned_signing',
}
const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export const planFieldOf = (word: string): PlanField | null => PLAN_ALIASES[normal(word)] ?? null

type Plan = Record<PlanField, string>
interface Result { ok: true; edit: LifecycleEdit; changed: string[] }
interface Refusal { ok: false; error: string }

const isRealDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

function readPlan(detail: unknown): { plan: Plan; rest: Record<string, unknown> } | null {
  const d = detail as { plan?: Record<string, unknown> } | null
  if (!d || typeof d !== 'object' || !d.plan) return null
  const plan = d.plan
  if (!(Object.keys(PLAN_FIELDS) as PlanField[]).every((f) => typeof plan[f] === 'string')) return null
  return { plan: plan as unknown as Plan, rest: d as Record<string, unknown> }
}

export const planSummary = (p: Plan) => `Advertise ${p.planned_advertisement}, open bids ${p.planned_bid_opening}, finish evaluation ${p.planned_evaluation_complete}, sign ${p.planned_signing}.`

/** Apply changes to a plan item's detail. `changes` is field to new value; dates are YYYY-MM-DD. */
export function applyPlanChanges(detail: unknown, changes: Partial<Record<PlanField, string>>): Result | Refusal {
  const read = readPlan(detail)
  if (!read) return { ok: false, error: 'This item has no plan to edit.' }
  const next: Plan = { ...read.plan }
  const changed: string[] = []
  for (const [field, raw] of Object.entries(changes) as [PlanField, string][]) {
    const value = String(raw).trim()
    if (value === '') return { ok: false, error: `${PLAN_FIELDS[field]} cannot be empty.` }
    if (DATE_FIELDS.includes(field) && !isRealDate(value)) return { ok: false, error: `${PLAN_FIELDS[field]} must be a real date written as YYYY-MM-DD (for example 2027-03-15); "${value}" is not.` }
    if (next[field] !== value) { next[field] = value; changed.push(`${PLAN_FIELDS[field]}: ${read.plan[field]} → ${value}`) }
  }
  for (let i = 1; i < DATE_FIELDS.length; i++) {
    const before = DATE_FIELDS[i - 1]!, after = DATE_FIELDS[i]!
    if (next[after] < next[before]) return { ok: false, error: `${PLAN_FIELDS[after]} (${next[after]}) cannot be before ${PLAN_FIELDS[before].toLowerCase()} (${next[before]}). Change the other date too, or choose a later one.` }
  }
  return { ok: true, changed, edit: { detail: { ...read.rest, plan: next }, summary: planSummary(next) } }
}

interface RawClause { field?: string; label: string; unit: string; value: number | string; edited?: boolean; [k: string]: unknown }

function readClauses(detail: unknown): { clauses: RawClause[]; rest: Record<string, unknown> } | null {
  const d = detail as { clauses?: unknown } | null
  if (!d || !Array.isArray(d.clauses)) return null
  const ok = d.clauses.every((c) => c && typeof c === 'object' && typeof (c as RawClause).label === 'string' && ['number', 'string'].includes(typeof (c as RawClause).value))
  return ok ? { clauses: d.clauses as RawClause[], rest: d as Record<string, unknown> } : null
}

export const clauseText = (c: Pick<RawClause, 'label' | 'unit' | 'value'>) => `${c.label}: ${typeof c.value === 'number' ? c.value.toLocaleString('en-US') : c.value}${c.unit ? ` ${c.unit}` : ''}`
const clausesSummary = (clauses: RawClause[]) => clauses.map(clauseText).join('; ')

/** Apply changes to a tender-clauses item. A clause is named by its label or its field key; a number clause needs a number. */
export function applyClauseChanges(detail: unknown, changes: { clause: string; value: string | number }[]): Result | Refusal {
  const read = readClauses(detail)
  if (!read) return { ok: false, error: 'This item has no tender clauses to edit.' }
  const clauses = read.clauses.map((c) => ({ ...c }))
  const changed: string[] = []
  for (const ch of changes) {
    const wanted = normal(ch.clause)
    const target = clauses.find((c) => normal(c.label) === wanted || (c.field && normal(c.field) === wanted.replace(/ /g, '_')))
      ?? clauses.find((c) => normal(c.label).includes(wanted))
    if (!target) return { ok: false, error: `There is no clause called "${ch.clause}". The clauses are: ${clauses.map((c) => c.label).join(', ')}.` }
    let value: number | string
    if (typeof target.value === 'number') {
      const n = typeof ch.value === 'number' ? ch.value : Number(String(ch.value).replace(/[, ]/g, ''))
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${target.label} takes a number of zero or more${target.unit ? ` (${target.unit})` : ''}; "${ch.value}" is not one.` }
      value = n
    } else {
      value = String(ch.value).trim()
      if (value === '') return { ok: false, error: `${target.label} cannot be empty.` }
    }
    if (value !== target.value) { changed.push(`${target.label}: ${typeof target.value === 'number' ? target.value.toLocaleString('en-US') : target.value} → ${typeof value === 'number' ? value.toLocaleString('en-US') : value}${target.unit ? ` ${target.unit}` : ''}`); target.value = value; target.edited = true }
  }
  return { ok: true, changed, edit: { detail: { ...read.rest, clauses }, summary: clausesSummary(clauses) } }
}

// ---- Estimates: the figures (medians) and the planning dates worked out from them ----

const MILESTONE_ORDER: DatedMilestone['id'][] = ['approval', 'effectiveness', 'advertisement', 'bid_opening', 'evaluation_complete', 'contract_signing', 'completion']
const MILESTONE_ALIASES: Record<string, DatedMilestone['id']> = {
  approval: 'approval', 'board approval': 'approval', effectiveness: 'effectiveness', advertisement: 'advertisement', advertise: 'advertisement', advertising: 'advertisement',
  'bid opening': 'bid_opening', bid_opening: 'bid_opening', opening: 'bid_opening', 'evaluation complete': 'evaluation_complete', evaluation_complete: 'evaluation_complete', evaluation: 'evaluation_complete',
  'contract signing': 'contract_signing', contract_signing: 'contract_signing', signing: 'contract_signing', signature: 'contract_signing', completion: 'completion', 'project completion': 'completion',
}
export const milestoneOf = (word: string): DatedMilestone['id'] | null => MILESTONE_ALIASES[normal(word)] ?? null

interface RawRow { metric: string; unit: string; value: number | string | null; edited?: boolean; [k: string]: unknown }

function readEstimates(detail: unknown): { rows: RawRow[]; timeline: DatedPlanning | null; rest: Record<string, unknown> } | null {
  const d = detail as { rows?: unknown; timeline?: unknown } | null
  if (!d || !Array.isArray(d.rows)) return null
  if (!d.rows.every((r) => r && typeof r === 'object' && typeof (r as RawRow).metric === 'string')) return null
  const t = d.timeline as DatedPlanning | undefined | null
  const timeline = t && typeof t === 'object' && Array.isArray(t.milestones) && typeof t.completion === 'string' ? t : null
  return { rows: d.rows as RawRow[], timeline, rest: d as Record<string, unknown> }
}

const figure = (r: Pick<RawRow, 'value' | 'unit'>) => `${typeof r.value === 'number' ? r.value.toLocaleString('en-US') : r.value}${r.unit ? ` ${r.unit}` : ''}`

/** The one-line summary of an estimates item: its first figures and, for planning, the completion date. */
export function estimatesSummary(rows: RawRow[], timeline: DatedPlanning | null) {
  const shown = rows.filter((r) => r.value !== null).slice(0, 4).map((r) => `${r.metric}: ${figure(r)}`).join('; ')
  return shown + (timeline ? `. Project completion ${timeline.completion}${timeline.assumed ? ' (assumed: 10 years from today)' : ''}.` : '')
}

const SET_BY_USER = 'Set by you.'

/**
 * Apply changes to an estimates item. `figures` change a median (by its metric name); the planning dates are then worked out again from the figures, keeping
 * any date the user set by hand. `dates` set a milestone directly: they must be real, stay in order, and a changed completion date is no longer assumed.
 */
export function applyEstimateChanges(detail: unknown, changes: { figures?: { metric: string; value: string | number }[]; dates?: { milestone: string; value: string }[] }): Result | Refusal {
  const read = readEstimates(detail)
  if (!read) return { ok: false, error: 'This item has no estimates to edit.' }
  const rows = read.rows.map((r) => ({ ...r }))
  const changed: string[] = []

  for (const ch of changes.figures ?? []) {
    const wanted = normal(ch.metric)
    const target = rows.find((r) => normal(r.metric) === wanted) ?? rows.find((r) => normal(r.metric).includes(wanted))
    if (!target || target.value === null) return { ok: false, error: `There is no figure called "${ch.metric}". The figures are: ${rows.filter((r) => r.value !== null).map((r) => r.metric).join('; ')}.` }
    let value: number | string
    if (typeof target.value === 'number') {
      const n = typeof ch.value === 'number' ? ch.value : Number(String(ch.value).replace(/[, ]/g, ''))
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${target.metric} takes a number of zero or more${target.unit ? ` (${target.unit})` : ''}; "${ch.value}" is not one.` }
      value = n
    } else {
      value = String(ch.value).trim()
      if (value === '') return { ok: false, error: `${target.metric} cannot be empty.` }
    }
    if (value !== target.value) { changed.push(`${target.metric}: ${figure(target)} → ${figure({ value, unit: target.unit })}`); target.value = value; target.edited = true }
  }

  let timeline = read.timeline
  if (timeline && (changes.figures?.length ?? 0) > 0 && changed.length > 0) {
    // Work the dates out again from the changed figures, from the same completion date, and put back every date the user set by hand.
    const hand = new Map(timeline.milestones.filter((m) => m.how === SET_BY_USER).map((m) => [m.id, m.date]))
    const rebuilt = datePlanningEstimates(rows, timeline.completion, new Date().toISOString().slice(0, 10))
    timeline = {
      ...rebuilt, assumed: timeline.assumed && !hand.has('completion'),
      milestones: rebuilt.milestones.map((m) => (hand.has(m.id) ? { ...m, date: hand.get(m.id)!, how: SET_BY_USER } : m)),
    }
    timeline.completion = timeline.milestones.find((m) => m.id === 'completion')?.date ?? timeline.completion
  }

  if ((changes.dates?.length ?? 0) > 0) {
    if (!timeline) return { ok: false, error: 'These estimates have no dates to change: only the planning estimates are placed on a calendar.' }
    const ms = timeline.milestones.map((m) => ({ ...m }))
    for (const ch of changes.dates ?? []) {
      const id = milestoneOf(ch.milestone)
      const target = id ? ms.find((m) => m.id === id) : undefined
      if (!target) return { ok: false, error: `There is no date called "${ch.milestone}". The dates are: ${ms.map((m) => m.label).join(', ')}.` }
      const value = String(ch.value).trim()
      if (!isRealDate(value)) return { ok: false, error: `${target.label} must be a real date written as YYYY-MM-DD (for example 2027-03-15); "${value}" is not.` }
      if (target.date !== value) { changed.push(`${target.label}: ${target.date} → ${value}`); target.date = value; target.how = SET_BY_USER }
    }
    const ordered = [...ms].sort((a, b) => MILESTONE_ORDER.indexOf(a.id) - MILESTONE_ORDER.indexOf(b.id))
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i]!.date < ordered[i - 1]!.date) return { ok: false, error: `${ordered[i]!.label} (${ordered[i]!.date}) cannot be before ${ordered[i - 1]!.label.toLowerCase()} (${ordered[i - 1]!.date}). Change the other date too, or choose a later one.` }
    }
    const completion = ms.find((m) => m.id === 'completion')!.date
    const procurement = ordered.filter((m) => m.id !== 'completion')
    const last = procurement[procurement.length - 1]
    timeline = { ...timeline, milestones: ms, completion, assumed: timeline.assumed && completion === timeline.completion, overrun: !!last && last.date > completion }
  }

  return { ok: true, changed, edit: { detail: { ...read.rest, rows, timeline: timeline ?? undefined }, summary: estimatesSummary(rows, timeline) } }
}

// ---- By command: the chat tool ----

export interface EditCommand {
  what: 'plan' | 'tender'
  /** Which item, when the lifecycle holds several of that kind. */
  title?: string | null
  changes?: { field: string; value: string | number }[]
  /** true saves the item as final, false reopens it. */
  finalize?: boolean | null
}

export type EditOutcome =
  | { ok: false; text: string }
  | { ok: true; id: string; text: string; edit?: LifecycleEdit; final?: boolean }

/**
 * Works out what an edit command does to the lifecycle, without doing it: the item it names, the new figures and whether it is saved as final. The caller
 * applies the result to the store. The text is written for the model to pass on, so it says what changed or exactly why nothing did.
 */
export function planEditCommand(items: LifecycleItem[], cmd: EditCommand): EditOutcome {
  // "The plan" is a plan, or the planning estimates; "the tender draft" is tender clauses, or the tender design estimates.
  const ofKind = items.filter((i) => (cmd.what === 'plan' ? i.stage === 'planning' && (i.kind === 'plan' || i.kind === 'estimates') : i.stage === 'tender-design' && (i.kind === 'tender-clauses' || i.kind === 'estimates')))
  const noun = cmd.what === 'plan' ? 'plan' : 'tender clauses'
  if (ofKind.length === 0) return { ok: false, text: `The user's lifecycle has no ${noun} yet, so there is nothing to edit. They can ask for a suggestion and press Add to my lifecycle first.` }
  const pool = cmd.title ? ofKind.filter((i) => normal(i.title).includes(normal(cmd.title!))) : ofKind
  if (pool.length === 0) return { ok: false, text: `No ${noun} in the lifecycle is called "${cmd.title}". They are: ${ofKind.map((i) => i.title).join('; ')}.` }
  if (pool.length > 1) return { ok: false, text: `The lifecycle has ${pool.length} items for the ${noun}: ${pool.map((i) => i.title).join('; ')}. Ask the user which one, then call again with its title.` }
  const item = pool[0]!
  const changes = cmd.changes ?? []

  if (changes.length === 0 && cmd.finalize === undefined) return { ok: false, text: 'Nothing was changed: no change was given.' }
  if (changes.length > 0 && item.final) return { ok: false, text: `"${item.title}" is saved as final, so it was not changed. The user can press Reopen on it (or ask you to reopen it) first.` }

  let edit: LifecycleEdit | undefined
  let said = ''
  if (changes.length > 0) {
    let result: Result | Refusal
    if (item.kind === 'plan') {
      const mapped: Partial<Record<PlanField, string>> = {}
      for (const c of changes) {
        const f = planFieldOf(c.field)
        if (!f) return { ok: false, text: `"${c.field}" is not a field of the plan. The fields are: ${Object.values(PLAN_FIELDS).join(', ')}.` }
        mapped[f] = String(c.value)
      }
      result = applyPlanChanges(item.detail, mapped)
    } else if (item.kind === 'tender-clauses') {
      result = applyClauseChanges(item.detail, changes.map((c) => ({ clause: c.field, value: c.value })))
    } else {
      // Estimates: a name that is a planning date is a date; anything else is a figure (a median).
      const dates = changes.filter((c) => milestoneOf(c.field)).map((c) => ({ milestone: c.field, value: String(c.value) }))
      const figures = changes.filter((c) => !milestoneOf(c.field)).map((c) => ({ metric: c.field, value: c.value }))
      result = applyEstimateChanges(item.detail, { figures, dates })
    }
    if (!result.ok) return { ok: false, text: `Nothing was changed. ${result.error}` }
    edit = result.edit
    said = result.changed.length > 0 ? `Changed in "${item.title}": ${result.changed.join('; ')}.` : `"${item.title}" already had those values, so nothing changed.`
  }
  const final = cmd.finalize === null || cmd.finalize === undefined ? undefined : cmd.finalize
  if (final === true) said += `${said ? ' ' : ''}Saved "${item.title}" as final.`
  if (final === false) said += `${said ? ' ' : ''}Reopened "${item.title}" for editing.`
  return { ok: true, id: item.id, text: said, edit, final }
}
