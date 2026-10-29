import { describe, expect, it } from 'vitest'
import { checkSourceUrl, classifySource, groupLinksByRecord, ingestionSteps, linkRecords } from './ai'
import type { Chunk, Contract, Doc, Project, SourceLink, SupervisionReport } from './schemas'

describe('checkSourceUrl', () => {
  it('accepts a public https link and normalises it', () => {
    const r = checkSourceUrl('  https://documents.worldbank.org/en/publication/x  ')
    expect(r.ok).toBe(true)
    expect(r.host).toBe('documents.worldbank.org')
    expect(r.warnings).toEqual([])
  })
  it('warns on http and rejects bad input with a reason', () => {
    expect(checkSourceUrl('http://data.worldbank.org/x').warnings).toHaveLength(1)
    for (const bad of ['', 'not a url', 'ftp://data.worldbank.org', 'https://user:pw@data.worldbank.org', 'http://localhost:3001', 'https://192.168.0.1/a', 'https://intranet/x']) {
      const r = checkSourceUrl(bad)
      expect(r.ok).toBe(false)
      expect(r.problems.length).toBeGreaterThan(0)
    }
  })
})

describe('classifySource', () => {
  it('recognises known hosts and subdomains, and leaves others unclassified', () => {
    expect(classifySource('documents.worldbank.org')?.publisher).toBe('World Bank')
    expect(classifySource('x.finances.worldbank.org')?.kind).toContain('Contract awards')
    expect(classifySource('example.com')).toBeNull()
  })
})

describe('ingestionSteps', () => {
  const link = (reachability: SourceLink['reachability'], publisher: string | null): SourceLink => ({ id: 'L', project_id: 'P', url: 'https://example.com/a', host: 'example.com', reachability, checked_at: 'x', publisher, kind: publisher ? 'k' : null, added_by_role: 'planner' })
  it('never claims extraction happened', () => {
    const steps = ingestionSteps(link('reachable', null))
    expect(steps.find((s) => s.id === 'extract')?.status).toBe('planned')
    expect(steps.find((s) => s.id === 'classify')?.status).toBe('skipped')
  })
  it('marks an unreachable server as failed', () => {
    expect(ingestionSteps(link('unreachable', null)).find((s) => s.id === 'reach')?.status).toBe('failed')
  })
})

describe('linkRecords', () => {
  const project = { project_id: 'P1', project_name: 'Road Project' } as Project
  const contract = (ref: string) => ({ borrower_contract_reference_number: ref, supplier: 'S' }) as Contract
  const report = { id: 'R1', sequence: 1, date: '2026-01-01' } as SupervisionReport
  const doc = (id: string, pid: string, date: string) => ({ doc_id: id, project_id: pid, date }) as Doc
  const chunk = (id: string, docId: string, text: string) => ({ chunk_id: id, doc_id: docId, text }) as Chunk
  const docs = [doc('D1', 'P1', '2026-01-01'), doc('D2', 'OTHER', '2026-01-01')]
  const chunks = [chunk('C1', 'D1', 'Contract REF-001 is late.'), chunk('C2', 'D2', 'Contract REF-001 is mentioned elsewhere.')]
  const links = linkRecords({ project, contracts: [contract('REF-001'), contract('REF-002')], reports: [report], docs, chunks })

  it('links by contract reference and by report date, using only this project\'s documents', () => {
    expect(links.map((l) => `${l.reason}:${l.structured.id}:${l.chunk.chunk_id}`).sort()).toEqual(['contract_reference:REF-001:C1', 'report_date:R1:C1'])
  })
  it('does not link a contract nothing mentions', () => {
    expect(links.some((l) => l.structured.id === 'REF-002')).toBe(false)
  })
  it('groups the links by structured record, keeping the order records first appear', () => {
    const groups = groupLinksByRecord([...links, ...links])
    expect(groups.map((g) => g.structured.id)).toEqual(['REF-001', 'R1'])
    expect(groups.map((g) => g.links.length)).toEqual([2, 2])
    expect(groupLinksByRecord([])).toEqual([])
  })
  it('returns nothing without documents', () => {
    expect(linkRecords({ project, contracts: [contract('REF-001')], reports: [report], docs: [], chunks })).toEqual([])
  })
})
