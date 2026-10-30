// Lists small World Bank projects from the contract pages cached on this computer (pnpm ingest:small): good first projects to ingest, because
// a project with few contract awards usually has little else. Reads ingest/cache only, no network. Projects already stored are left out.
//   pnpm ingest:small          10 projects with 5 to 25 contract awards
//   pnpm ingest:small 3 12     a different range
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { isProjectId } from '../packages/data/src/ingestEvents'
import { CACHE_DIR, ROOT } from './nodeIo'

export interface SmallProject { project_id: string; contracts: number; country: string; sector: string; first_year: number; last_year: number }

/** Counts contract rows per project over every cached page. `skip` holds ids to leave out. */
export function smallProjects(cacheDir: string, min: number, max: number, skip: Set<string> = new Set(), limit = 10): { found: SmallProject[]; pages: number } {
  const files = existsSync(cacheDir) ? readdirSync(cacheDir).filter((f) => /^contracts-page-\d+-\d+\.json\.gz$/.test(f)) : []
  const by = new Map<string, SmallProject>()
  for (const f of files) {
    const page = JSON.parse(gunzipSync(readFileSync(join(cacheDir, f))).toString('utf8')) as { data: Record<string, any>[] }
    for (const r of page.data) {
      const id = String(r.project_id)
      if (!isProjectId(id) || skip.has(id)) continue
      const year = Number(r.fiscal_year) || 0
      const p = by.get(id) ?? { project_id: id, contracts: 0, country: String(r.borrower_country ?? ''), sector: String(r.project_global_practice ?? ''), first_year: year, last_year: year }
      p.contracts++; p.first_year = Math.min(p.first_year, year || p.first_year); p.last_year = Math.max(p.last_year, year)
      by.set(id, p)
    }
  }
  const found = [...by.values()].filter((p) => p.contracts >= min && p.contracts <= max)
    // Newer projects first: their documents are more likely to be on record. Then the smaller ones.
    .sort((a, b) => b.last_year - a.last_year || a.contracts - b.contracts || a.project_id.localeCompare(b.project_id)).slice(0, limit)
  return { found, pages: files.length }
}

if (process.argv[1]?.endsWith('smallProjects.ts')) {
  const [min = 5, max = 25] = process.argv.slice(2).map(Number)
  const dir = join(ROOT, 'mock', 'ingested')
  const stored = new Set(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')) : [])
  const { found, pages } = smallProjects(CACHE_DIR, min, max, stored)
  if (pages === 0) { console.error('No cached contract pages found. Run pnpm ingest:index first.'); process.exit(1) }
  console.log(`From ${pages} cached pages: projects with ${min} to ${max} contract awards, not yet stored (newest first)\n`)
  for (const p of found) console.log(`${p.project_id}  ${String(p.contracts).padStart(3)} contracts  ${p.first_year}-${p.last_year}  ${p.country} · ${p.sector}\n  https://projects.worldbank.org/en/projects-operations/project-detail/${p.project_id}`)
  console.log('\nIn the chat, ask for one by its id, for example: "Tell me about project <id>".')
}
