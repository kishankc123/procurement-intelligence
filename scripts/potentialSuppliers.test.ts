// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withDefaults, type AssistantDb } from '../packages/data/src/assistant'
import { potentialSuppliers } from '../packages/data/src/potentialSuppliers'
import { projectScope } from '../packages/data/src/scope'

const db = withDefaults(JSON.parse(readFileSync(new URL('../mock/db.json', import.meta.url), 'utf8')) as Partial<AssistantDb>)

describe('potential suppliers', () => {
  it('lists the suppliers that won contracts on the real projects a country matches, ranked by value', () => {
    const r = potentialSuppliers(db, 'Cambodia')
    expect('suppliers' in r).toBe(true)
    if (!('suppliers' in r)) return
    expect(r.projects.map((p) => p.id)).toEqual(['P150572'])
    expect(r.suppliers.length).toBeGreaterThan(5)
    for (let i = 1; i < r.suppliers.length; i++) expect(r.suppliers[i - 1]!.total_usd).toBeGreaterThanOrEqual(r.suppliers[i]!.total_usd)
    expect(r.suppliers.every((s) => s.projects.every((id) => id === 'P150572'))).toBe(true)
  })

  it('uses only real projects, and says it holds no contact details and cannot say who will bid', () => {
    const r = potentialSuppliers(db, 'road')
    if (!('suppliers' in r)) throw new Error('expected suppliers')
    expect(r.data_kind).toContain('real')
    for (const p of r.projects) expect(projectScope(p.id)).toBe('real')
    expect(r.notes.join(' ')).toContain('no contact details')
    expect(r.notes.join(' ')).toContain('not a list of who will bid')
  })

  it('adds up a supplier across the matched projects', () => {
    const r = potentialSuppliers(db, 'road')
    if (!('suppliers' in r)) throw new Error('expected suppliers')
    const top = r.suppliers[0]!
    const own = db.contracts.filter((c) => c.supplier_id === top.supplier_id && top.projects.includes(c.project_id))
    expect(top.contracts).toBe(own.length)
    expect(top.total_usd).toBe(Math.round(own.reduce((n, c) => n + c.supplier_contract_amount_usd, 0)))
  })

  it('falls back to all real projects, with a note, when nothing matches', () => {
    const r = potentialSuppliers(db, 'submarine cables')
    if (!('suppliers' in r)) throw new Error('expected suppliers')
    expect(r.projects.length).toBeGreaterThan(1)
    expect(r.notes.join(' ')).toContain('submarine cables')
  })

  it('says so when the matched project has no contract awards', () => {
    expect(potentialSuppliers(db, 'Road Sector Project Lao 2010 P102398')).toBeTruthy()
    const noContracts = { ...db, contracts: [] }
    expect(potentialSuppliers(noContracts, 'Cambodia')).toHaveProperty('missing')
  })
})
