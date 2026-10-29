import { describe, expect, it } from 'vitest'
import { contractsWithoutCountry, projectCountryMarkers, supplierCountryMarkers } from './mapMarkers'
import type { Contract, Project } from './schemas'

const contract = (ref: string, supplier: string, country: string, amount: number): Contract => ({
  borrower_contract_reference_number: ref, wb_contract_number: 'W', project_id: 'P1', supplier: `Name ${supplier}`, supplier_id: supplier, supplier_country: country,
  procurement_category: 'Works', procurement_method: 'Open', review_type: 'Prior', supplier_contract_amount_usd: amount, contract_signing_date: '2024-01-01', fiscal_year: 2024, contract_description: 'd',
})
const project = (id: string, code: string, country: string) => ({ project_id: id, project_name: `Name ${id}`, borrower_country: country, borrower_country_code: code }) as Project

describe('supplierCountryMarkers', () => {
  const list = [contract('A', 'S1', 'India', 100), contract('B', 'S2', 'India', 50), contract('C', 'S3', 'Romania', 400), contract('D', 'S4', '', 10)]
  it('groups by country, largest commitment first, and skips contracts with no country', () => {
    const m = supplierCountryMarkers(list)
    expect(m.map((x) => x.country)).toEqual(['Romania', 'India'])
    expect(m[1]?.count).toBe(2)
    expect(m[1]?.detail).toBe('2 suppliers, 2 contracts, USD 150 committed')
  })
  it('counts the contracts it could not place', () => expect(contractsWithoutCountry(list)).toBe(1))
})

describe('projectCountryMarkers', () => {
  it('groups projects by country code', () => {
    const m = projectCountryMarkers([project('P1', 'LA', 'Laos'), project('P2', 'LA', 'Laos'), project('P3', 'RO', 'Romania')])
    expect(m.map((x) => [x.country, x.count])).toEqual([['LA', 2], ['RO', 1]])
  })
})
