// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withDefaults, type AssistantDb } from '../packages/data/src/assistant'
import { matchProjects } from '../packages/data/src/scope'
import { suggestPlan, suggestTenderClauses } from '../packages/data/src/tenderSuggestion'

const db = withDefaults(JSON.parse(readFileSync(new URL('../mock/db.json', import.meta.url), 'utf8')) as Partial<AssistantDb>)
const clause = (r: ReturnType<typeof suggestTenderClauses>, field: string) => ('clauses' in r ? r.clauses.find((c) => c.field === field) : undefined)

describe('suggested tender clauses', () => {
  it('always gives a draft for a road tender, even though no real project holds clauses', () => {
    const r = suggestTenderClauses(db, 'road')
    expect('clauses' in r).toBe(true)
    expect(clause(r, 'bid_validity_days')?.value).toBeGreaterThan(0)
    expect(clause(r, 'evaluation_method')?.value).toBeTruthy()
  })

  it('takes a clause from real data where the real data supports it, and says so', () => {
    const r = suggestTenderClauses(db, 'road')
    const period = clause(r, 'bid_submission_days')!
    expect(period.source).toBe('real')
    expect(period.value).toBeGreaterThanOrEqual(3)
    expect(period.from[0]).toContain('tender notices')
    expect(clause(r, 'reference_works_contract_usd')?.source).toBe('real')
  })

  it('takes the rest from the demonstration drafts, each marked as such, never mixed into one number', () => {
    const r = suggestTenderClauses(db, 'road')
    for (const f of ['duration_months', 'bid_validity_days', 'performance_security_pct', 'min_similar_contracts', 'min_similar_value_usd', 'evaluation_method']) {
      const c = clause(r, f)!
      expect(c.source, f).toBe('mock')
      expect(c.from.every((id) => id.startsWith('P-MOCK')), f).toBe(true)
    }
    expect('notes' in r && r.notes.join(' ')).toContain('demonstration')
  })

  it('does not need a sector match: with no draft for the sector, the other stored drafts are used and the note says so', () => {
    const r = suggestTenderClauses(db, 'submarine cables')
    expect(clause(r, 'bid_validity_days')?.value).toBeGreaterThan(0)
    expect('notes' in r && r.notes.join(' ')).toContain('submarine cables')
  })

  it('uses real data only when asked, and then leaves out what real data cannot support', () => {
    const r = suggestTenderClauses(db, 'road', 'real')
    expect(clause(r, 'bid_submission_days')?.source).toBe('real')
    expect(clause(r, 'bid_validity_days')).toBeUndefined()
    const m = suggestTenderClauses(db, 'road', 'mock')
    expect(clause(m, 'bid_submission_days')).toBeUndefined()
    expect(clause(m, 'bid_validity_days')?.source).toBe('mock')
  })
})

describe('matching a keyword to projects', () => {
  it('finds the Liberia road project from "road Liberia", and falls back to any word, then to nothing', () => {
    const real = db.projects.filter((p) => !p.project_id.startsWith('P-MOCK'))
    expect(matchProjects(real, 'road Liberia').map((p) => p.project_id)).toEqual(['P125574'])
    expect(matchProjects(real, 'Liberia water').map((p) => p.project_id)).toEqual(['P125574'])
    expect(matchProjects(real, 'submarine cables')).toEqual([])
    expect(matchProjects(real, '')).toEqual(real)
  })
})

describe('suggested plan', () => {
  it('falls back to the stored demonstration plans when the real projects hold no stage dates, and says so', () => {
    const r = suggestPlan(db, { start_date: '2027-03-01', keyword: 'road' })
    expect('plan' in r).toBe(true)
    expect(r.data_kind).toContain('mock')
    expect('note' in r && r.note).toContain('demonstration plans')
  })

  it('uses all stored plans when none matches the sector', () => {
    const r = suggestPlan(db, { start_date: '2027-03-01', keyword: 'submarine cables' })
    expect('plan' in r).toBe(true)
    expect('note' in r && r.note).toContain('submarine cables')
  })

  it('answers missing, not a mock plan, when real data only is asked for', () => {
    expect('missing' in suggestPlan(db, { start_date: '2027-03-01' }, 'real')).toBe(true)
  })
})
