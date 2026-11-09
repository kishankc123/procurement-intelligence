// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fileCache } from './nodeIo'
import { smallProjects } from './smallProjects'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
const row = (id: string, year: number) => ({ project_id: id, fiscal_year: year, borrower_country: 'Peru', project_global_practice: 'Transport' })

describe('smallProjects', () => {
  it('counts contracts per project across cached pages, filters by range, skips stored ones, newest first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-small-')); dirs.push(dir)
    const cache = fileCache(dir)
    const many = Array.from({ length: 30 }, () => row('P000003', 2015))
    cache.put('contracts-page-1000-0', { count: 3, data: [row('P000001', 2020), row('P000001', 2021), row('P000002', 2022), ...many] })
    cache.put('contracts-page-1000-1', { data: [row('P000001', 2019), row('P000002', 2023), row('P000004', 2024), row('bad', 2024)] })
    const { found, pages } = smallProjects(dir, 2, 25)
    expect(pages).toBe(2)
    expect(found.map((p) => [p.project_id, p.contracts])).toEqual([['P000002', 2], ['P000001', 3]]) // P000003 has 30, P000004 has 1; newest year first
    expect(found[1]).toMatchObject({ first_year: 2019, last_year: 2021, country: 'Peru', sector: 'Transport' })
    expect(smallProjects(dir, 2, 25, new Set(['P000002'])).found.map((p) => p.project_id)).toEqual(['P000001'])
  })
  it('reports no pages for a missing cache', () => { expect(smallProjects('/nonexistent/dir', 1, 5)).toEqual({ found: [], pages: 0 }) })
})
