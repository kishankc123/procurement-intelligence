// Pure helpers for supplier profiles. No React, no fetch.
import { THRESHOLDS } from '@pi/config'
import { dayDiff, gate, type Gate } from './selectors'
import type { Amendment, Citation, Contract, ContractMilestone } from './schemas'

export interface SupplierContractRow {
  contract: Contract
  /** Approved amendments only: pending and rejected ones are not part of the record. */
  amendments: Amendment[]
  valueChangeUsd: number
  /** Approved value change as a share of the contract amount, in percent. */
  valueChangePct: number
  daysAdded: number
  /** Completed milestones with how many days after (positive) or before (negative) plan they finished. */
  milestones: { milestone: ContractMilestone; delayDays: number }[]
}

export interface SupplierFlag {
  id: 'price_growth' | 'milestone_delay' | 'time_extensions'
  text: string
  evidence: Citation[]
}

export interface SupplierProfile {
  supplierId: string
  name: string
  country: string
  contracts: SupplierContractRow[]
  projects: string[]
  committedUsd: number
  valueChangeUsd: number
  priceChangePct: number
  /** Mean delay over completed milestones, or null when none has finished. */
  avgDelayDays: number | null
  completedMilestones: number
  timeExtensionContracts: number
  /** Whether there are enough contracts to raise flags. The history is shown either way. */
  gate: Gate
  flags: SupplierFlag[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * One profile per supplier id, built from every contract it holds across projects, its approved amendments
 * and its completed milestones. Rates are totals, not guesses: price change is the sum of approved value changes
 * divided by the sum of contract amounts (contracts still running are included). Flags need
 * `supplierProfileMinContracts` contracts; below that the numbers are shown without a verdict.
 */
export function supplierProfiles(contracts: Contract[], amendments: Amendment[], milestones: ContractMilestone[]): SupplierProfile[] {
  const bySupplier = new Map<string, Contract[]>()
  for (const c of contracts) bySupplier.set(c.supplier_id, [...(bySupplier.get(c.supplier_id) ?? []), c])

  const profiles = [...bySupplier.entries()].map(([supplierId, list]): SupplierProfile => {
    const rows = list
      .map((contract): SupplierContractRow => {
        const ref = contract.borrower_contract_reference_number
        const approved = amendments.filter((a) => a.contract_ref === ref && a.status === 'approved')
        const valueChangeUsd = approved.reduce((sum, a) => sum + a.value_change_usd, 0)
        return {
          contract, amendments: approved, valueChangeUsd,
          valueChangePct: contract.supplier_contract_amount_usd > 0 ? round1((valueChangeUsd / contract.supplier_contract_amount_usd) * 100) : 0,
          daysAdded: approved.reduce((sum, a) => sum + a.days_added, 0),
          milestones: milestones.filter((m) => m.contract_ref === ref && m.actual_date !== null).map((m) => ({ milestone: m, delayDays: dayDiff(m.planned_date, m.actual_date as string) })),
        }
      })
      .sort((a, b) => a.contract.contract_signing_date.localeCompare(b.contract.contract_signing_date))

    const committedUsd = rows.reduce((sum, r) => sum + r.contract.supplier_contract_amount_usd, 0)
    const valueChangeUsd = rows.reduce((sum, r) => sum + r.valueChangeUsd, 0)
    const delays = rows.flatMap((r) => r.milestones.map((m) => m.delayDays))
    const priceChangePct = committedUsd > 0 ? round1((valueChangeUsd / committedUsd) * 100) : 0
    const avgDelayDays = delays.length ? round1(delays.reduce((a, b) => a + b, 0) / delays.length) : null
    const timeExtensionContracts = rows.filter((r) => r.daysAdded > 0).length
    const g = gate(rows.length, THRESHOLDS.supplierProfileMinContracts)

    const flags: SupplierFlag[] = []
    if (g.ok) {
      const amdCites = (pick: (r: SupplierContractRow) => boolean): Citation[] =>
        rows.filter(pick).flatMap((r) => r.amendments.map((a): Citation => ({ ref_type: 'record', ref_id: a.id, label: `${r.contract.borrower_contract_reference_number} · amendment` })))
      if (priceChangePct > THRESHOLDS.supplierPriceGrowthPct) {
        flags.push({ id: 'price_growth', text: `Approved price changes add ${priceChangePct}% to the contract amounts (flag above ${THRESHOLDS.supplierPriceGrowthPct}%).`, evidence: amdCites((r) => r.valueChangeUsd !== 0) })
      }
      if (avgDelayDays !== null && avgDelayDays > THRESHOLDS.supplierDelayDays) {
        flags.push({
          id: 'milestone_delay', text: `Completed milestones finished ${avgDelayDays} days late on average, across ${delays.length} milestones (flag above ${THRESHOLDS.supplierDelayDays} days).`,
          evidence: rows.flatMap((r) => r.milestones.filter((m) => m.delayDays > 0).map((m): Citation => ({ ref_type: 'record', ref_id: m.milestone.id, label: `${r.contract.borrower_contract_reference_number} · ${m.milestone.name}` }))),
        })
      }
      if (timeExtensionContracts / rows.length >= THRESHOLDS.supplierTimeExtensionShare) {
        flags.push({ id: 'time_extensions', text: `${timeExtensionContracts} of ${rows.length} contracts got an approved time extension (flag at ${Math.round(THRESHOLDS.supplierTimeExtensionShare * 100)}% or more).`, evidence: amdCites((r) => r.daysAdded > 0) })
      }
    }

    const first = list[0] as Contract
    return {
      supplierId, name: first.supplier, country: first.supplier_country, contracts: rows,
      projects: [...new Set(rows.map((r) => r.contract.project_id))].sort(), committedUsd, valueChangeUsd, priceChangePct, avgDelayDays,
      completedMilestones: delays.length, timeExtensionContracts, gate: g, flags,
    }
  })

  return profiles.sort((a, b) => b.flags.length - a.flags.length || b.committedUsd - a.committedUsd)
}
