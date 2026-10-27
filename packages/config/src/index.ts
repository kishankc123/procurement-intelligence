// Single place K edits roles, thresholds and fiscal-year logic live.

export type Role = 'planner' | 'contract_manager' | 'reviewer' | 'admin'
export const ROLES: { id: Role; label: string }[] = [
  { id: 'planner', label: 'Planner' },
  { id: 'contract_manager', label: 'Contract manager' },
  { id: 'reviewer', label: 'Reviewer' },
  { id: 'admin', label: 'Admin' },
]

export type Permission =
  | 'edit_plan' | 'edit_tender_draft' | 'edit_tender_facts'
  | 'edit_contract_end' | 'edit_amendments' | 'edit_milestones'
  | 'approve_entries' | 'resolve_conflicts' | 'review_feedback' | 'assign_alerts'

const PERMISSIONS: Record<Role, Permission[]> = {
  planner: ['edit_plan', 'edit_tender_draft', 'edit_tender_facts'],
  contract_manager: ['edit_tender_facts', 'edit_contract_end', 'edit_amendments', 'edit_milestones', 'assign_alerts'],
  reviewer: ['approve_entries', 'resolve_conflicts', 'review_feedback', 'assign_alerts'],
  admin: [
    'edit_plan', 'edit_tender_draft', 'edit_tender_facts', 'edit_contract_end', 'edit_amendments',
    'edit_milestones', 'approve_entries', 'resolve_conflicts', 'review_feedback', 'assign_alerts',
  ],
}

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission)
}

/** Short reason shown next to a disabled control. */
export function whyDisabled(permission: Permission): string {
  const allowed = ROLES.filter((r) => PERMISSIONS[r.id].includes(permission)).map((r) => r.label)
  return `Needs role: ${allowed.join(' or ')}`
}

/** Thresholds shown in gate messages. Change a number here and every gate follows. */
export const THRESHOLDS = {
  tenderBenchmarkMinContracts: 10,
  competitionBenchmarkMinContracts: 10,
  restructuringModelMinProjects: 30,
  durationModelMinProjects: 30,
  disbursementLagPoints: 20,
} as const

/** Bank fiscal year: FY2026 = 2025-07-01 to 2026-06-30. */
export function fiscalYearOf(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00Z' : '')) : date
  const year = d.getUTCFullYear()
  return d.getUTCMonth() >= 6 ? year + 1 : year
}

export function fiscalYearRange(fy: number): { start: string; end: string } {
  return { start: `${fy - 1}-07-01`, end: `${fy}-06-30` }
}

export function fiscalYearLabel(fy: number): string {
  const { start, end } = fiscalYearRange(fy)
  const fmt = (s: string) =>
    new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `FY${fy} · ${fmt(start)} to ${fmt(end)}`
}

export const FISCAL_YEARS = [2024, 2025, 2026]
export const DEFAULT_FISCAL_YEAR = 2026
export const DEFAULT_PROJECT_ID = 'P-MOCK-001'

/** World Bank country codes differ from ISO for some countries. */
export const WB_TO_ISO: Record<string, string> = { ROM: 'RO', EST: 'EE' }
// Deployed builds call the same-origin /api function; localhost uses json-server on :3001.
export const API_BASE =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:3001'
