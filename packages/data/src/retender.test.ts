import { describe, expect, it } from 'vitest'
import { checkRetender, tenderCandidates, type TenderCandidate } from './retender'
import type { Plan, TenderRecord } from './schemas'

const rec = (over: Partial<TenderRecord>): TenderRecord => ({ id: 'T1', project_id: 'P', name: 'Road safety signage supply', status: 'cancelled', date: '2026-02-10', reason: 'low participation', contract_ref: null, replaces: null, citation: null, ...over })
const pool = (...r: Partial<TenderRecord>[]): TenderCandidate[] => tenderCandidates(r.map(rec), [])

describe('checkRetender', () => {
  it('finds the same tender by id, including the contract reference it was awarded as', () => {
    const c = pool({ id: 'TND-1', status: 'awarded', contract_ref: 'REF-001' })
    expect(checkRetender('tnd 1', c).matches[0]?.kind).toBe('same_id')
    expect(checkRetender('ref-001', c).matches[0]?.kind).toBe('same_id')
  })
  it('finds the same name ignoring case, punctuation and filler words', () => {
    const r = checkRetender('Road Safety: signage supply!', pool({}))
    expect(r.matches[0]?.kind).toBe('same_name')
    expect(r.verdict.tone).toBe('attention')
    expect(r.verdict.text).toContain('why it was cancelled')
  })
  it('finds a similar name only at or above the threshold', () => {
    const c = pool({ name: 'Pipe supply tender (re-issued)', id: 'T8', status: 're_tendered' })
    expect(checkRetender('Pipe supply tender', c).matches[0]).toMatchObject({ kind: 'similar_name', similarity: 0.6 })
    expect(checkRetender('Pipe supply', pool({ name: 'Pipe supply tender (re-issued)' })).matches).toHaveLength(0)
  })
  it('treats a different lot number as a variant, not a duplicate', () => {
    const r = checkRetender('Road resurfacing works, Lot 3', pool({ name: 'Road resurfacing works, Lot 2' }))
    expect(r.matches[0]?.kind).toBe('numbered_variant')
    expect(r.verdict.tone).toBe('info')
  })
  it('reports no match and how many records it searched', () => {
    const r = checkRetender('Construction supervision consultancy', pool({}, { id: 'T2', name: 'Bridge works' }))
    expect(r.matches).toEqual([])
    expect(r.compared).toBe(2)
    expect(r.verdict).toMatchObject({ tone: 'ok' })
    expect(r.verdict.text).toContain('2 tenders')
  })
  it('excludes the plan being checked so it never matches itself', () => {
    const plan = { id: 'PL1', project_id: 'P', name: 'Lot 3 works', planned_advertisement: '2026-06-15' } as Plan
    const c = tenderCandidates([], [plan])
    expect(checkRetender('Lot 3 works', c).matches).toHaveLength(1)
    expect(checkRetender('Lot 3 works', c, { excludeIds: ['PL1'] }).matches).toHaveLength(0)
  })
  it('asks for input when the query is empty', () => {
    expect(checkRetender('   ', pool({})).verdict.tone).toBe('info')
  })
})
