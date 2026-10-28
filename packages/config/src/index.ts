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

/** The four lifecycle steps of one project. Order, labels and copy shown on the Home donut and in the nav. */
export const LIFECYCLE_STEPS = [
  { id: 'planning', to: '/planning', label: 'Planning',
    summary: 'Plan the procurement packages for a project: dates, method and category. Each plan is compared with country reference data, and gaps are shown as missing.' },
  { id: 'tender-design', to: '/tender-design', label: 'Tender design',
    summary: 'Draft tender clauses such as duration and bid validity, then compare them with your plan and with past contracts once there are enough contracts to compare.' },
  { id: 'monitoring', to: '/monitoring', label: 'Monitoring',
    summary: 'Follow delivery after award: alerts from supervision ratings, disbursement against time elapsed and contract end dates, each with its evidence.' },
  { id: 'learning', to: '/learning', label: 'Learning',
    summary: 'Review feedback on recommendations, see how entered data covers contracts, and follow what changed in the update log.' },
] as const

export type LifecycleStepId = (typeof LIFECYCLE_STEPS)[number]['id']

/** Pages that work across projects rather than inside one lifecycle step. */
export const PLATFORM_AREAS = [
  { to: '/project-data', label: 'Project data', summary: 'Public contract awards, plus the tender facts, amendments and end dates your team enters. Reviewers approve entries here.' },
  { to: '/knowledge', label: 'Knowledge base', summary: 'The source registry, documents and the text chunks that recommendations cite.' },
  { to: '/evidence', label: 'Evidence workbench', summary: 'Conflicts between sources and how each one was resolved.' },
] as const
