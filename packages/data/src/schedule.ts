// Pure helpers for the Schedule (Gantt) page. No React, no fetch.
import { THRESHOLDS } from '@pi/config'
import { dayDiff } from './selectors'
import type { Plan, Project, ScheduleItem } from './schemas'

export type ScheduleStatus = 'complete' | 'on_track' | 'behind' | 'overdue' | 'upcoming' | 'no_progress'
export type ScheduleGroup = ScheduleItem['group']

export interface ScheduleRow {
  id: string
  name: string
  group: ScheduleGroup
  start: string
  end: string
  milestone: boolean
  progress: number | null
  source: 'mock' | 'plan'
  status: ScheduleStatus
  /** Share of the item's time already used at the as-of date, 0 to 100. Null before it starts. */
  expected: number | null
  /** Expected minus recorded progress, in points. Null when either is unknown. */
  gap: number | null
}

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  complete: 'Complete', on_track: 'On track', behind: 'Behind', overdue: 'Overdue', upcoming: 'Not started', no_progress: 'No progress recorded',
}

export function expectedPct(start: string, end: string, asOf: string): number {
  const span = dayDiff(start, end)
  if (span <= 0) return asOf >= end ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((dayDiff(start, asOf) / span) * 100)))
}

function classify(item: Pick<ScheduleItem, 'start' | 'end' | 'progress_pct'>, asOf: string): Pick<ScheduleRow, 'status' | 'expected' | 'gap'> {
  const milestone = item.start === item.end
  if (milestone) return { status: asOf >= item.end ? 'complete' : 'upcoming', expected: null, gap: null }
  if (item.progress_pct === 100) return { status: 'complete', expected: 100, gap: 0 }
  if (asOf < item.start) return { status: 'upcoming', expected: null, gap: null }
  const expected = expectedPct(item.start, item.end, asOf)
  if (item.progress_pct === null) return { status: asOf > item.end ? 'overdue' : 'no_progress', expected, gap: null }
  const gap = expected - item.progress_pct
  if (asOf > item.end) return { status: 'overdue', expected, gap }
  return { status: gap > THRESHOLDS.scheduleLagPoints ? 'behind' : 'on_track', expected, gap }
}

/**
 * Rows for one project's Gantt chart: the mock operational items, plus one tender row per plan
 * (advertisement to signing, taken from the plan you entered).
 */
export function scheduleRows(items: ScheduleItem[], plans: Plan[], asOf: string): ScheduleRow[] {
  const mock = items.map((i): ScheduleRow => ({
    id: i.id, name: i.name, group: i.group, start: i.start, end: i.end, milestone: i.start === i.end,
    progress: i.progress_pct, source: 'mock', ...classify(i, asOf),
  }))
  const fromPlans = plans.map((p): ScheduleRow => {
    const base = { start: p.planned_advertisement, end: p.planned_signing, progress_pct: null }
    return { id: p.id, name: `Tender: ${p.name}`, group: 'Procurement', start: base.start, end: base.end, milestone: false, progress: null, source: 'plan', ...classify(base, asOf) }
  })
  return [...fromPlans, ...mock].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
}

export type ProjectPhase = 'Preparation' | 'Procurement' | 'Implementation' | 'Closing'

/**
 * Phase of a project at the as-of date, by these rules in order:
 * not yet effective -> Preparation; closing within 12 months -> Closing;
 * no works, supplies or manpower item has started -> Procurement; otherwise Implementation.
 */
export function projectPhase(project: Project, rows: ScheduleRow[], asOf: string): ProjectPhase {
  if (!project.effectiveness_actual) return 'Preparation'
  const closing = project.closing_date_revised ?? project.closing_date_planned
  if (dayDiff(asOf, closing) <= 365) return 'Closing'
  const delivering = rows.some((r) => r.group !== 'Procurement' && r.group !== 'Milestone' && r.start <= asOf)
  return delivering ? 'Implementation' : 'Procurement'
}

/** Chart range: the earliest start to the latest end, widened to whole months. */
export function scheduleRange(rows: ScheduleRow[], asOf: string): { start: string; end: string } {
  const starts = [...rows.map((r) => r.start), asOf].sort()
  const ends = [...rows.map((r) => r.end), asOf].sort()
  const first = starts[0] ?? asOf
  const last = ends[ends.length - 1] ?? asOf
  const lastMonthEnd = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)).toISOString().slice(0, 10)
  return { start: `${first.slice(0, 7)}-01`, end: lastMonthEnd }
}
