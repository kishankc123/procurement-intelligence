// Pure helpers that turn stored records into map markers. No React, no fetch, no map code: the map card decides where a country is drawn.
import type { Contract, Project } from './schemas'

/** One place on the map. `country` is a country name or an ISO alpha-2 code, exactly as the record holds it. */
export interface MapMarker {
  id: string
  country: string
  label: string
  /** How many records are here; the circle grows with it. */
  count: number
  detail: string
}

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

/** Where the suppliers are: one marker per supplier country, from the contract awards. Contracts with no supplier country are left out (the card reports how many). */
export function supplierCountryMarkers(contracts: Contract[]): MapMarker[] {
  const byCountry = new Map<string, { suppliers: Set<string>; contracts: number; usd: number }>()
  for (const c of contracts) {
    if (!c.supplier_country) continue
    const row = byCountry.get(c.supplier_country) ?? { suppliers: new Set<string>(), contracts: 0, usd: 0 }
    row.suppliers.add(c.supplier_id)
    row.contracts += 1
    row.usd += c.supplier_contract_amount_usd
    byCountry.set(c.supplier_country, row)
  }
  return [...byCountry.entries()]
    .sort((a, b) => b[1].usd - a[1].usd)
    .map(([country, r]) => ({
      id: country, country, label: country, count: r.contracts,
      detail: `${r.suppliers.size} ${r.suppliers.size === 1 ? 'supplier' : 'suppliers'}, ${r.contracts} ${r.contracts === 1 ? 'contract' : 'contracts'}, USD ${usd(r.usd)} committed`,
    }))
}

/** Where the projects are: one marker per borrower country (the record holds the country, not a site). */
export function projectCountryMarkers(projects: Project[]): MapMarker[] {
  const byCountry = new Map<string, Project[]>()
  for (const p of projects) byCountry.set(p.borrower_country_code, [...(byCountry.get(p.borrower_country_code) ?? []), p])
  return [...byCountry.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([code, list]) => ({
      id: code, country: code, label: list[0]?.borrower_country ?? code, count: list.length,
      detail: list.map((p) => `${p.project_name} (${p.project_id})`).join('; '),
    }))
}

/** Contracts that have no supplier country: they cannot be placed, and the card says so rather than guessing. */
export const contractsWithoutCountry = (contracts: Contract[]) => contracts.filter((c) => !c.supplier_country).length
