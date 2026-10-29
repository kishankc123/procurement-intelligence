// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withDefaults, type AssistantDb } from '../packages/data/src/assistant'
import { projectScope, scopeProblem, scopedDb } from '../packages/data/src/scope'
import { proposePlan, referencePractice, searchDocuments } from '../packages/data/src/assistantData'

const db = withDefaults(JSON.parse(readFileSync(new URL('../mock/db.json', import.meta.url), 'utf8')) as Partial<AssistantDb>)
const ids = (rows: { project_id?: string }[]) => new Set(rows.map((r) => r.project_id))

describe('real versus mock', () => {
  it('tells them apart by id', () => {
    expect(projectScope('P158504')).toBe('real')
    expect(projectScope('P-MOCK-001')).toBe('mock')
    expect(projectScope('GENERAL')).toBe('mock')
  })

  it('keeps only real records in the real scope, in every collection', () => {
    const real = scopedDb(db, 'real')
    expect(real.projects.length).toBeGreaterThan(0)
    for (const rows of [real.projects, real.contracts, real.plans, real.tender_drafts, real.supervision_reports, real.completion_reports, real.documents]) {
      for (const id of ids(rows)) expect(projectScope(id as string)).toBe('real')
    }
    const docIds = new Set(real.documents.map((d) => d.doc_id))
    expect(real.chunks.every((c) => docIds.has(c.doc_id))).toBe(true)
    expect(real.sources.every((s) => s.id.startsWith('SRC-WB-'))).toBe(true)
  })

  it('keeps only mock records in the mock scope', () => {
    const mock = scopedDb(db, 'mock')
    expect(mock.projects.length).toBeGreaterThan(0)
    for (const rows of [mock.projects, mock.contracts, mock.documents]) for (const id of ids(rows)) expect(projectScope(id as string)).toBe('mock')
    expect(mock.sources.some((s) => s.id.startsWith('SRC-WB-'))).toBe(false)
  })

  it('never lets mock plans or drafts answer a real request: the real scope reports them missing', () => {
    const real = scopedDb(db, 'real')
    expect(proposePlan(real, { start_date: '2027-01-01' })).toHaveProperty('missing')
    expect(JSON.stringify(referencePractice(real))).not.toContain('P-MOCK')
    const hits = searchDocuments(real, 'procurement guidance evaluation award')
    expect(JSON.stringify(hits)).not.toContain('Mock')
  })

  it('stops a project of the other kind and an unknown project', () => {
    expect(scopeProblem(db, 'real', 'P158504')).toBeNull()
    expect(scopeProblem(db, 'real', 'P-MOCK-001')).toContain('Do not mix')
    expect(scopeProblem(db, 'mock', 'P158504')).toContain('Do not mix')
    expect(scopeProblem(db, 'real', 'P000000')).toContain('No project')
    expect(scopeProblem(db, 'real')).toBeNull()
  })
})
