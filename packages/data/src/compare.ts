// Pure helpers for comparing projects side by side. No React, no fetch. A figure with no source is null (shown as Missing), never zero or an average.
// Real and mock projects are never compared with each other: the assistant keeps the two kinds apart, so a mixed request is refused here as well.
import { projectScope, type DataScope } from './scope'
import { timeElapsedPct } from './selectors'
import type { Amendment, CompletionReport, Contract, Project, SupervisionReport } from './schemas'

export const COMPARE_METRICS = [
  { id: 'committedUsd', label: 'Committed (USD)', unit: 'USD', source: 'Contract awards: sum of supplier contract amounts (committed, not disbursed). There is no budget field in the data.' },
  { id: 'contracts', label: 'Contracts', unit: '', source: 'Contract awards: number of contracts.' },
  { id: 'suppliers', label: 'Suppliers', unit: '', source: 'Contract awards: distinct supplier IDs.' },
  { id: 'avgContractUsd', label: 'Average contract (USD)', unit: 'USD', source: 'Committed amount divided by contracts.' },
  { id: 'priceChangePct', label: 'Price change after signing (%)', unit: '%', source: 'Approved amendment value changes as a share of the contract amounts. Missing when no amendments are recorded.' },
  { id: 'timesExtended', label: 'Times extended', unit: '', source: 'Approved amendments that added days. Missing when no amendments are recorded.' },
  { id: 'disbursedPct', label: 'Disbursed (%)', unit: '%', source: 'Latest supervision report.' },
  { id: 'timeElapsedPct', label: 'Time elapsed (%)', unit: '%', source: 'Effectiveness to closing, at the date of the latest supervision report.' },
] as const

export type CompareMetricId = (typeof COMPARE_METRICS)[number]['id']

export interface CompareRow {
  projectId: string
  name: string
  country: string
  /** Where the project stands, in words, from its completion and supervision reports. */
  status: string
  values: Record<CompareMetricId, number | null>
  /** What the figures rest on. */
  n: { contracts: number; reports: number }
}

export type CompareResult =
  | { ok: true; scope: DataScope; rows: CompareRow[]; unknown: string[] }
  | { ok: false; reason: 'too_few' | 'mixed'; text: string }

const round1 = (n: number) => Math.round(n * 10) / 10

export function compareProjects(
  input: { projects: Project[]; contracts: Contract[]; amendments: Amendment[]; reports: SupervisionReport[]; completionReports: Pick<CompletionReport, 'project_id'>[] },
  ids: string[],
): CompareResult {
  const wanted = [...new Set(ids)]
  const found = wanted.filter((id) => input.projects.some((p) => p.project_id === id))
  const unknown = wanted.filter((id) => !found.includes(id))
  if (found.length < 2) return { ok: false, reason: 'too_few', text: `Comparing needs at least two stored projects${unknown.length > 0 ? `; no project has the id ${unknown.join(', ')}` : ''}.` }
  const scopes = new Set(found.map(projectScope))
  if (scopes.size > 1) return { ok: false, reason: 'mixed', text: 'These projects are a mix of real World Bank data and mock demonstration data. They are not compared with each other: ask for two real projects or two mock projects.' }

  const rows = found.map((id): CompareRow => {
    const project = input.projects.find((p) => p.project_id === id)!
    const contracts = input.contracts.filter((c) => c.project_id === id)
    const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
    const recorded = input.amendments.filter((a) => refs.has(a.contract_ref))
    const approved = recorded.filter((a) => a.status === 'approved')
    const reports = input.reports.filter((r) => r.project_id === id)
    const latest = [...reports].sort((a, b) => b.sequence - a.sequence)[0]
    const committed = contracts.reduce((n, c) => n + c.supplier_contract_amount_usd, 0)
    const hasContracts = contracts.length > 0
    const hasAmendments = hasContracts && recorded.length > 0
    const completed = input.completionReports.some((r) => r.project_id === id)
    return {
      projectId: id, name: project.project_name, country: project.borrower_country,
      status: completed ? 'Completed (completion report on record)' : latest ? `Under supervision (report ${latest.sequence}, ${latest.date})` : 'No supervision or completion report',
      n: { contracts: contracts.length, reports: reports.length },
      values: {
        committedUsd: hasContracts ? committed : null,
        contracts: hasContracts ? contracts.length : null,
        suppliers: hasContracts ? new Set(contracts.map((c) => c.supplier_id)).size : null,
        avgContractUsd: hasContracts ? Math.round(committed / contracts.length) : null,
        priceChangePct: hasAmendments && committed > 0 ? round1((approved.reduce((n, a) => n + a.value_change_usd, 0) / committed) * 100) : null,
        timesExtended: hasAmendments ? approved.filter((a) => a.days_added > 0).length : null,
        disbursedPct: latest ? latest.disbursed_pct : null,
        timeElapsedPct: latest ? timeElapsedPct(project, latest.date) : null,
      },
    }
  })
  return { ok: true, scope: [...scopes][0]!, rows, unknown }
}
