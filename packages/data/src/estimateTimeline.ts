// The planning estimates are durations ("project length", "bidding period"), which have no place on a calendar until they are anchored to a date.
// The anchor is the project completion date: the user's, or ten years from today when they give none. Every other date is worked back from it
// with the same medians, so the calendar only ever shows a duration the estimates actually hold. A duration that is missing leaves its milestone out.
const DAY = 86_400_000

export interface DatedMilestone {
  id: 'approval' | 'effectiveness' | 'advertisement' | 'bid_opening' | 'evaluation_complete' | 'contract_signing' | 'completion'
  label: string
  /** YYYY-MM-DD */
  date: string
  /** Where the date comes from, in one line. */
  how: string
}

export interface DatedPlanning {
  completion: string
  /** True when the user gave no date and the completion date is ten years from today. */
  assumed: boolean
  milestones: DatedMilestone[]
  /** Milestones that could not be placed, and why. */
  notes: string[]
  /** True when the procurement runs past the completion date. */
  overrun: boolean
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const addDaysIso = (d: string, n: number) => iso(parse(d) + n * DAY)

/** Ten years from `today` (YYYY-MM-DD), the completion date used when the user gives none. */
export function defaultCompletion(today: string) {
  const [y, m, d] = today.split('-').map(Number)
  const next = new Date(Date.UTC((y ?? 1970) + 10, (m ?? 1) - 1, d ?? 1))
  return iso(next.getTime())
}

const isDate = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parse(d))

interface RowLike { metric: string; value: number | string | null }

/**
 * Dates for the planning estimates. `completion` is the user's project completion date, or empty/invalid for "none given", which means ten years from `today`.
 * Approval is the completion date minus the median project length; effectiveness follows approval; advertisement starts at effectiveness (an assumption, stated
 * in the label); then bid opening, evaluation complete and signing follow by the median periods the estimates hold.
 */
export function datePlanningEstimates(rows: RowLike[], completion: string | undefined, today: string): DatedPlanning {
  const notes: string[] = []
  // A completion date that is already past cannot be planned for: it is treated as not given, and the result says so.
  const past = isDate(completion) && completion < today
  if (past) notes.push(`The completion date you gave (${completion}) is before today (${today}), so ten years from today is used instead.`)
  const assumed = !isDate(completion) || past
  const end = isDate(completion) && !past ? completion : defaultCompletion(today)
  const num = (prefix: string) => {
    const v = rows.find((r) => r.metric.startsWith(prefix))?.value
    return typeof v === 'number' ? v : undefined
  }
  const months = num('Planned project length')
  const toEffective = num('Approval to effectiveness')
  const bidding = num('Bidding period')
  const evaluation = num('Evaluation period')
  const award = num('Award to signing')
  const milestones: DatedMilestone[] = []

  if (months === undefined) {
    notes.push('No planned project length in the estimates, so the start of the project cannot be placed. Only the completion date is shown.')
  } else {
    let at = addDaysIso(end, -Math.round(months * 30.44))
    // No date is ever placed before today. When working back from the completion date lands in the past, the project starts today and the rest follows forward;
    // it then runs shorter than the median length, which the note says, and the completion date stays the one the user gave.
    if (at < today) {
      at = today
      milestones.push({ id: 'approval', label: 'Board approval', date: at, how: `Today. The median planned length of ${months} months would start before today, so the plan starts now and runs shorter.` })
      notes.push(`Working back ${months} months from ${end} would start before today (${today}), so the plan starts today and the project is given less time than the median.`)
    } else milestones.push({ id: 'approval', label: 'Board approval', date: at, how: `Completion date minus the median planned length of ${months} months.` })
    if (toEffective !== undefined) {
      at = addDaysIso(at, Math.round(toEffective))
      milestones.push({ id: 'effectiveness', label: 'Effectiveness', date: at, how: `${Math.round(toEffective)} days after approval (median).` })
    } else notes.push('No approval-to-effectiveness period in the estimates, so effectiveness is not placed.')
    milestones.push({ id: 'advertisement', label: 'Advertisement', date: at, how: 'Assumed to start when the project becomes effective.' })
    if (bidding !== undefined) {
      at = addDaysIso(at, Math.round(bidding))
      milestones.push({ id: 'bid_opening', label: 'Bid opening', date: at, how: `${Math.round(bidding)} days after advertisement (median bidding period).` })
      if (evaluation !== undefined) {
        at = addDaysIso(at, Math.round(evaluation))
        milestones.push({ id: 'evaluation_complete', label: 'Evaluation complete', date: at, how: `${Math.round(evaluation)} days after bid opening (median).` })
        if (award !== undefined) {
          at = addDaysIso(at, Math.round(award))
          milestones.push({ id: 'contract_signing', label: 'Contract signing', date: at, how: `${Math.round(award)} days after evaluation (median).` })
        } else notes.push('No award-to-signing period in the estimates, so contract signing is not placed.')
      } else notes.push('No evaluation period in the estimates, so evaluation and signing are not placed.')
    } else notes.push('No bidding period in the estimates, so bid opening, evaluation and signing are not placed.')
  }
  const lastProcurement = milestones.length > 0 ? milestones[milestones.length - 1]!.date : undefined
  milestones.push({ id: 'completion', label: 'Project completion', date: end, how: assumed ? `No date was given, so ten years from today (${today}).` : 'The date you gave.' })
  return { completion: end, assumed, milestones, notes, overrun: !!lastProcurement && lastProcurement > end }
}
