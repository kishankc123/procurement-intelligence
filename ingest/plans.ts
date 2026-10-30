// Adds one procurement plan per project to its stored snapshot (mock/ingested/<project>.json) as `plan_packages`: the package table of the newest
// Procurement Plan document that has one (reference, description, estimated cost, method, review, expected bid opening).
//   pnpm ingest:plans P158504 P163730 ...     (reuses ingest/cache; --fresh fetches again)
// The tables in these documents are layout text with wrapped cells, so a model reads them (OPENAI_API_KEY from the git-ignored .env.local).
// The model is never trusted: a row is kept only when its reference, the first words of its description and its cost text all appear in the
// document slice that was sent. The reading and the checking are in planRows.ts, which the live ingestion shares (it now does this step by itself).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isProjectId } from '../packages/data/src/ingestEvents'
import { nodeIo, openAiPlanExtractor, ROOT } from './nodeIo'
import { planSource, readPlanPackages, type PlanDoc } from './planRows'

try { process.loadEnvFile(join(ROOT, '.env.local')) } catch { /* no .env.local */ }
const ids = process.argv.slice(2).filter((a) => isProjectId(a))
const fresh = process.argv.includes('--fresh')
if (ids.length === 0) { console.error('Usage: pnpm ingest:plans P158504 [P163730 ...] [--fresh]'); process.exit(1) }
const { extractor, reason } = openAiPlanExtractor()
if (!extractor) { console.error(`${reason}. Nothing was sent anywhere.`); process.exit(1) }

async function main() {
  const io = nodeIo({ fresh })
  for (const projectId of ids) {
    const file = join(ROOT, 'mock', 'ingested', `${projectId}.json`)
    if (!existsSync(file)) { console.error(`[plans ${projectId}] no snapshot yet: run pnpm ingest ${projectId} first`); continue }
    const snapshot = JSON.parse(readFileSync(file, 'utf8')) as { manifest: Record<string, any>; collections: Record<string, unknown[]> }
    const all = await io.cache.get<(PlanDoc & { docty?: string })[]>(`documents-${projectId}`)
    if (!all) { console.error(`[plans ${projectId}] no document list in the cache: run pnpm ingest ${projectId} first`); continue }
    const docs = all.filter((d) => d.docty === 'Procurement Plan' && d.txturl).sort((a, b) => String(b.docdt).localeCompare(String(a.docdt)))
    const reading = await readPlanPackages({
      projectId, docs, extractor: extractor!, io,
      getText: async (doc) => { const key = `text-${doc.id}`; const hit = await io.cache.get<string>(key); if (hit !== undefined) return hit; const text = await io.getText(doc.txturl!); await io.cache.put(key, text); return text },
    })
    if (!reading.chosen || reading.rows.length === 0) { console.log(`[plans ${projectId}] ${docs.length} plan documents, none of the newest ${reading.looked} gave a package table that could be checked against its text`); continue }
    snapshot.collections.plan_packages = reading.rows
    snapshot.manifest.sources = [...(snapshot.manifest.sources as { name: string }[]).filter((s) => !String(s.name).startsWith('Procurement Plan document')), planSource(reading.chosen, reading.rows.length, extractor!.model, docs.length, reading.dropped)]
    snapshot.manifest.counts = { ...snapshot.manifest.counts, plan_packages: reading.rows.length }
    snapshot.manifest.not_done = (snapshot.manifest.not_done as string[]).map((n) => (n.startsWith('Procurement plan packages') ? 'Procurement plan: only the first package rows of one plan document are read; other plan versions and later tables (consultants, training) are not.' : n))
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`[plans ${projectId}] plan ${reading.chosen.id} (${String(reading.chosen.docdt).slice(0, 10)}): kept ${reading.rows.length} package rows, dropped ${reading.dropped}, ${reading.tokens} tokens`)
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
