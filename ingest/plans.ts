// Adds one procurement plan per project to its stored snapshot (mock/ingested/<project>.json) as `plan_packages`: the package table of the newest
// Procurement Plan document that has one (reference, description, estimated cost, method, review, expected bid opening).
//   pnpm ingest:plans P158504 P163730 ...     (reuses ingest/cache; --fresh fetches again)
// The tables in these documents are layout text with wrapped cells, so a model reads them (OPENAI_API_KEY from the git-ignored .env.local, plain fetch).
// The model is never trusted: a row is kept only when its reference number, the first words of its description and its cost text all appear in
// the document slice that was sent. Costs, methods and dates are stored exactly as the document writes them (no unit conversion, no guessing).
// @ts-ignore Node.js type declarations are not included for this script.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
// @ts-ignore Node.js type declarations are not included for this script.
import { dirname, join } from 'node:path'
// @ts-ignore Node.js type declarations are not included for this script.
import { fileURLToPath } from 'node:url'

declare const process: { argv: string[]; env: Record<string, string | undefined>; exit: (code: number) => never; loadEnvFile: (path: string) => void }
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'ingest', 'cache')
const snapshotDir = join(root, 'mock', 'ingested')
try { process.loadEnvFile(join(root, '.env.local')) } catch { /* no .env.local */ }
const ids = process.argv.slice(2).filter((a) => /^P\d{6}$/.test(a))
const fresh = process.argv.includes('--fresh')
if (ids.length === 0) { console.error('Usage: pnpm ingest:plans P158504 [P163730 ...] [--fresh]'); process.exit(1) }
if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY is not set (put it in .env.local). Nothing was sent anywhere.'); process.exit(1) }
const MODEL = (process.env.OPENAI_MODEL ?? 'openai/gpt-4.1-mini').replace(/^openai\//, '')
const SLICE = 14000
const MAX_ROWS = 15

interface RawDoc { id: string; docty?: string; docdt?: string; display_title?: string; txturl?: string; pdfurl?: string }
interface PlanRow { id: string; project_id: string; plan_doc: string; plan_date: string; ref_no: string | null; description: string; category: string | null; estimated_cost: string | null; cost_unit: string | null; packages: string | null; method: string | null; review: string | null; expected_bid_opening: string | null; source_url: string }
interface Extracted { cost_unit: string | null; packages: { ref_no: string; description: string; category: string | null; estimated_cost: string | null; packages: string | null; method: string | null; review: string | null; expected_bid_opening: string | null }[] }

async function planText(doc: RawDoc): Promise<string> {
  const file = join(cacheDir, `plantext-${doc.id}.json`)
  if (!fresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as string
  const res = await fetch(String(doc.txturl).replace('http://', 'https://'))
  if (!res.ok) throw new Error(`Could not read plan text ${doc.id}: ${res.status}`)
  const text = await res.text()
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(file, JSON.stringify(text))
  return text
}

/** True when the parts of a reference (split on - and spaces) occur in order, each within 500 characters of the one before. The table wraps a reference over several lines, with other columns between. */
function partsInOrder(text: string, ref: string): boolean {
  const parts = ref.split(/[-\s]+/).filter(Boolean).map((p) => p.toLowerCase())
  if (parts.length === 0 || ref.replace(/[^A-Za-z0-9]/g, '').length < 3) return false
  const lower = text.toLowerCase()
  for (let from = lower.indexOf(parts[0]!); from >= 0; from = lower.indexOf(parts[0]!, from + 1)) {
    let at = from, ok = true
    for (const part of parts.slice(1)) { const next = lower.indexOf(part, at + 1); if (next < 0 || next - at > 500) { ok = false; break } at = next }
    if (ok) return true
  }
  return false
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Where the first package table starts, or -1. A table header names a reference column and a cost or bid-opening column close together. */
function tableStart(text: string): number {
  // A header row names a reference column, a description (or contract or package) column and a cost column, with its cells wrapped over lines.
  const re = /\bRef\.?/gi
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const w = text.slice(m.index, m.index + 4000).replace(/\s+/g, ' ').slice(0, 900)
    if (/(Descripti|Contract|Package)/i.test(w) && /(Estimat|Cost)/i.test(w) && (w.match(/\d/g) ?? []).length >= 8) return m.index
  }
  return -1
}

async function extract(projectId: string, slice: string): Promise<{ data: Extracted; tokens: number }> {
  const schema = {
    type: 'object', additionalProperties: false, required: ['cost_unit', 'packages'],
    properties: {
      cost_unit: { type: ['string', 'null'], description: 'The unit the estimated cost column is in, exactly as the table header writes it (for example "USD million"), or null.' },
      packages: { type: 'array', maxItems: MAX_ROWS, description: 'Rows of the table in order. Some plans list single packages, others only summary rows per method (for example "Summary of the ICB (Works)"); copy whichever rows the table has.', items: {
        type: 'object', additionalProperties: false, required: ['ref_no', 'description', 'category', 'estimated_cost', 'packages', 'method', 'review', 'expected_bid_opening'],
        properties: {
          ref_no: { type: 'string', description: 'The package reference number as written, with its wrapped parts joined (for example CW-PHO-PBC-01), or an empty string when the row has none.' },
          description: { type: 'string', description: 'The contract description, wrapped lines joined, copied from the table.' },
          category: { type: ['string', 'null'], description: 'The section heading the row sits under (for example Civil Works, Goods), or null.' },
          estimated_cost: { type: ['string', 'null'], description: 'The estimated cost exactly as written (keep commas and decimals as they are), or null.' },
          packages: { type: ['string', 'null'], description: 'The number of packages the row stands for, when the table has a column for it (summary rows do), as written, or null.' },
          method: { type: ['string', 'null'], description: 'The procurement method as written (for example NCB, RFB), or null.' },
          review: { type: ['string', 'null'], description: 'Prior or Post review as written, or null.' },
          expected_bid_opening: { type: ['string', 'null'], description: 'The expected bid opening date exactly as written, or null.' },
        },
      } },
    },
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'plan_packages', strict: true, schema } },
      messages: [
        { role: 'system', content: 'You copy rows out of a World Bank procurement plan table. Copy only what the text says, exactly. Never invent, convert or fix a value; use null when a cell is empty or unclear. Return at most the first rows of the table, in order.' },
        { role: 'user', content: `Project ${projectId}. Below is the start of the package table of its procurement plan, as extracted layout text (cells wrap over several lines and columns interleave). Return the first ${MAX_ROWS} rows of the first table that lists packages or package summaries (with costs).\n\n${slice}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`The model request failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { total_tokens: number } }
  return { data: JSON.parse(body.choices[0]!.message.content) as Extracted, tokens: body.usage?.total_tokens ?? 0 }
}

async function main() {
  for (const projectId of ids) {
    const file = join(snapshotDir, `${projectId}.json`)
    if (!existsSync(file)) { console.error(`[plans ${projectId}] no snapshot yet: run pnpm ingest ${projectId} first`); continue }
    const snapshot = JSON.parse(readFileSync(file, 'utf8')) as { manifest: Record<string, any>; collections: Record<string, unknown[]> }
    const docs = (JSON.parse(readFileSync(join(cacheDir, `documents-${projectId}.json`), 'utf8')) as RawDoc[])
      .filter((d) => d.docty === 'Procurement Plan' && d.txturl).sort((a, b) => String(b.docdt).localeCompare(String(a.docdt)))
    // The newest few plan documents that have a package table are each read; the one that yields the most verified rows is kept (newest wins a tie).
    const candidates: { doc: RawDoc; text: string; at: number }[] = []
    for (const doc of docs.slice(0, 8)) {
      if (candidates.length >= 3) break
      const text = await planText(doc); const at = tableStart(text)
      if (at >= 0) candidates.push({ doc, text, at })
    }
    if (candidates.length === 0) { console.log(`[plans ${projectId}] ${docs.length} plan documents, none of the newest 8 has a readable package table`); continue }
    let best: { chosen: (typeof candidates)[number]; slice: string; rows: PlanRow[]; dropped: number; tokens: number } | null = null
    for (const chosen of candidates) {
      // Wide STEP tables are padded with long runs of spaces; collapse them so the slice holds more table and fewer blanks.
      const slice = chosen.text.slice(chosen.at, chosen.at + SLICE * 3).replace(/[ \t]{3,}/g, '  ').slice(0, SLICE)
      const { data, tokens } = await extract(projectId, slice)
      const haystack = alnum(slice)
      let dropped = 0
      const rows = data.packages.flatMap((p, i): PlanRow[] => {
        // The longest of the first six words of the description must occur in the text (short ones like "Y1" prove nothing).
        const key = alnum([...p.description.split(/\s+/).slice(0, 6)].sort((x, y) => alnum(y).length - alnum(x).length)[0] ?? '')
        // A reference with letters or several characters must appear in order; a bare number ("1.", "2.1") proves nothing, so then the cost must be present and found.
        const refOk = p.ref_no.replace(/[^A-Za-z0-9]/g, '').length >= 3 ? partsInOrder(slice, p.ref_no) : !!p.estimated_cost
        const grounded = refOk && key.length >= 5 && haystack.includes(key) && (!p.estimated_cost || slice.includes(p.estimated_cost))
        if (!grounded) {
          dropped++
          if (process.argv.includes('--debug') && dropped <= 4) console.log('  dropped:', JSON.stringify({ ref: p.ref_no, refFound: refOk, key, cost: p.estimated_cost, costFound: !p.estimated_cost || slice.includes(p.estimated_cost) }))
          return []
        }
        return [{
          id: `PP-${projectId}-${String(i + 1).padStart(2, '0')}`, project_id: projectId, plan_doc: `DOC-WB-${chosen.doc.id}`, plan_date: String(chosen.doc.docdt).slice(0, 10),
          ref_no: p.ref_no.trim() || null, description: p.description.replace(/\s+/g, ' ').trim(), category: p.category, estimated_cost: p.estimated_cost, cost_unit: data.cost_unit, packages: p.packages,
          method: p.method, review: p.review, expected_bid_opening: p.expected_bid_opening, source_url: chosen.doc.pdfurl ?? chosen.doc.txturl ?? '',
        }]
      })
      if (!best || rows.length > best.rows.length) best = { chosen, slice, rows, dropped, tokens }
    }
    const { chosen, slice, rows, dropped, tokens } = best!
    // A cell that wrapped over two lines can come back cut: complete a cost from the text that follows it, and drop a date that ends mid-number.
    for (const r of rows) {
      if (r.estimated_cost) {
        const at = slice.indexOf(r.estimated_cost)
        const full = at >= 0 ? (slice.slice(at).match(/^[\d.,]+/)?.[0] ?? '').replace(/[.,]$/, '') : ''
        if (full.length > r.estimated_cost.replace(/[.,]$/, '').length) r.estimated_cost = full
      }
      if (r.estimated_cost) r.estimated_cost = r.estimated_cost.replace(/[.,]$/, '')
      if (r.expected_bid_opening && /^\d{4}-\d{2}-\d$/.test(r.expected_bid_opening)) r.expected_bid_opening = null
    }
    snapshot.collections.plan_packages = rows
    snapshot.manifest.sources = [...(snapshot.manifest.sources as { name: string }[]).filter((s) => !String(s.name).startsWith('Procurement Plan document')), {
      name: `Procurement Plan document ${chosen.doc.id} (${String(chosen.doc.docdt).slice(0, 10)})`, url: chosen.doc.pdfurl ?? chosen.doc.txturl, records: rows.length,
      note: `Newest of ${docs.length} plan documents with a readable package table. First ${rows.length} package rows read by ${MODEL}; ${dropped} rows dropped because their reference, description or cost was not found in the text. Values are copied as written.`,
    }]
    snapshot.manifest.counts = { ...snapshot.manifest.counts, plan_packages: rows.length }
    snapshot.manifest.not_done = (snapshot.manifest.not_done as string[]).map((n) => (n.startsWith('Procurement plan packages') ? 'Procurement plan: only the first package rows of one plan document are read; other plan versions and later tables (consultants, training) are not.' : n))
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`[plans ${projectId}] plan ${chosen.doc.id} (${String(chosen.doc.docdt).slice(0, 10)}): kept ${rows.length} package rows, dropped ${dropped}, ${tokens} tokens`)
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
