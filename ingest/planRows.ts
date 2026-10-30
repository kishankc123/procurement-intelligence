// Package rows of a project's procurement plan, read from the plan document's table by a model and then checked against the document text.
// The model is never trusted: a row is kept only when its reference, the first words of its description and its cost text all appear in the slice of
// the document that was sent. Costs, methods and dates are stored exactly as the document writes them (no unit conversion, no guessing).
// The model call comes in as `PlanExtractor`, so tests and the hosted function can swap it. Shared by the live pipeline and `pnpm ingest:plans`.
import { createHash } from 'node:crypto'
import type { PipelineIo } from './pipeline'

export const SLICE = 14000
export const MAX_ROWS = 15

export interface PlanDoc { id: string; docdt?: string; txturl?: string; pdfurl?: string; display_title?: string }
export interface PlanExtract {
  cost_unit: string | null
  packages: { ref_no: string; description: string; category: string | null; estimated_cost: string | null; packages: string | null; method: string | null; review: string | null; expected_bid_opening: string | null }[]
}
export interface PlanExtractor {
  model: string
  extract(projectId: string, slice: string): Promise<{ data: PlanExtract; tokens: number }>
}
export interface PlanRow {
  id: string; project_id: string; plan_doc: string; plan_date: string; ref_no: string | null; description: string; category: string | null; estimated_cost: string | null
  cost_unit: string | null; packages: string | null; method: string | null; review: string | null; expected_bid_opening: string | null; source_url: string
}

/** True when the parts of a reference (split on - and spaces) occur in order, each within 500 characters of the one before. The table wraps a reference over several lines, with other columns between. */
export function partsInOrder(text: string, ref: string): boolean {
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

/** Where the first package table starts, or -1. A header row names a reference column, a description (or contract or package) column and a cost column, with its cells wrapped over lines. */
export function tableStart(text: string): number {
  const re = /\bRef\.?/gi
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const w = text.slice(m.index, m.index + 4000).replace(/\s+/g, ' ').slice(0, 900)
    if (/(Descripti|Contract|Package)/i.test(w) && /(Estimat|Cost)/i.test(w) && (w.match(/\d/g) ?? []).length >= 8) return m.index
  }
  return -1
}

/** The JSON schema, system prompt and user prompt of the extraction request (the same wording the stored projects were read with). */
export function planRequest(projectId: string, slice: string, model: string) {
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
  return {
    model, temperature: 0,
    response_format: { type: 'json_schema', json_schema: { name: 'plan_packages', strict: true, schema } },
    messages: [
      { role: 'system', content: 'You copy rows out of a World Bank procurement plan table. Copy only what the text says, exactly. Never invent, convert or fix a value; use null when a cell is empty or unclear. Return at most the first rows of the table, in order.' },
      { role: 'user', content: `Project ${projectId}. Below is the start of the package table of its procurement plan, as extracted layout text (cells wrap over several lines and columns interleave). Return the first ${MAX_ROWS} rows of the first table that lists packages or package summaries (with costs).\n\n${slice}` },
    ],
  }
}

/** Checks the model's answer has the shape asked for, and turns a missing optional cell into null. Throws on anything else, so a malformed answer fails loudly instead of being stored. */
export function parsePlanExtract(content: string): PlanExtract {
  const raw = JSON.parse(content) as { cost_unit?: unknown; packages?: unknown }
  if (!Array.isArray(raw.packages)) throw new Error('The model answer has no packages list')
  const text = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    cost_unit: text(raw.cost_unit),
    packages: raw.packages.slice(0, MAX_ROWS).map((p: Record<string, unknown>, i: number) => {
      if (typeof p?.description !== 'string') throw new Error(`Package ${i + 1} in the model answer has no description`)
      return { ref_no: typeof p.ref_no === 'string' ? p.ref_no : '', description: p.description, category: text(p.category), estimated_cost: text(p.estimated_cost), packages: text(p.packages), method: text(p.method), review: text(p.review), expected_bid_opening: text(p.expected_bid_opening) }
    }),
  }
}

/** The rows of one extraction that are backed by the text, in the shape that is stored. */
export function groundRows(projectId: string, doc: PlanDoc, slice: string, data: PlanExtract): { rows: PlanRow[]; dropped: number } {
  const haystack = alnum(slice)
  let dropped = 0
  const rows = data.packages.flatMap((p, i): PlanRow[] => {
    // The longest of the first six words of the description must occur in the text (short ones like "Y1" prove nothing).
    const key = alnum([...p.description.split(/\s+/).slice(0, 6)].sort((x, y) => alnum(y).length - alnum(x).length)[0] ?? '')
    // A reference with letters or several characters must appear in order; a bare number ("1.", "2.1") proves nothing, so then the cost must be present and found.
    const refOk = p.ref_no.replace(/[^A-Za-z0-9]/g, '').length >= 3 ? partsInOrder(slice, p.ref_no) : !!p.estimated_cost
    const grounded = refOk && key.length >= 5 && haystack.includes(key) && (!p.estimated_cost || slice.includes(p.estimated_cost))
    if (!grounded) { dropped++; return [] }
    return [{
      id: `PP-${projectId}-${String(i + 1).padStart(2, '0')}`, project_id: projectId, plan_doc: `DOC-WB-${doc.id}`, plan_date: String(doc.docdt).slice(0, 10),
      ref_no: p.ref_no.trim() || null, description: p.description.replace(/\s+/g, ' ').trim(), category: p.category, estimated_cost: p.estimated_cost, cost_unit: data.cost_unit, packages: p.packages,
      method: p.method, review: p.review, expected_bid_opening: p.expected_bid_opening, source_url: doc.pdfurl ?? doc.txturl ?? '',
    }]
  })
  // A cell that wrapped over two lines can come back cut: complete a cost from the text that follows it, and drop a date that ends mid-number.
  for (const r of rows) {
    if (r.estimated_cost) {
      const at = slice.indexOf(r.estimated_cost)
      const full = at >= 0 ? (slice.slice(at).match(/^[\d.,]+/)?.[0] ?? '').replace(/[.,]$/, '') : ''
      if (full.length > r.estimated_cost.replace(/[.,]$/, '').length) r.estimated_cost = full
      r.estimated_cost = r.estimated_cost.replace(/[.,]$/, '')
    }
    if (r.expected_bid_opening && /^\d{4}-\d{2}-\d$/.test(r.expected_bid_opening)) r.expected_bid_opening = null
  }
  return { rows, dropped }
}

export interface PlanReading {
  rows: PlanRow[]
  chosen: PlanDoc | null
  /** How many plan documents were looked at, how many had a readable table, and how many rows were dropped for not being in the text. */
  looked: number; withTable: number; dropped: number; tokens: number
}

/**
 * Reads the package rows from the newest plan documents. The newest few (up to 8 looked at, 3 with a readable table) are each read; the one that yields the
 * most verified rows is kept, and the newest wins a tie. `getText` gives a document's text, or null when it is not available (refused or missing).
 * Each model answer is cached by document and slice, so a run continued in a later request does not pay for it again.
 */
export async function readPlanPackages(o: {
  projectId: string; docs: PlanDoc[]; extractor: PlanExtractor; io: Pick<PipelineIo, 'cache'>
  getText: (doc: PlanDoc) => Promise<string | null>; alive?: () => void
}): Promise<PlanReading> {
  const alive = o.alive ?? (() => undefined)
  const candidates: { doc: PlanDoc; text: string; at: number }[] = []
  let looked = 0
  for (const doc of o.docs.slice(0, 8)) {
    if (candidates.length >= 3) break
    alive(); looked++
    const text = await o.getText(doc)
    const at = text ? tableStart(text) : -1
    if (text && at >= 0) candidates.push({ doc, text, at })
  }
  let best: { doc: PlanDoc; rows: PlanRow[]; dropped: number } | null = null
  let tokens = 0
  for (const c of candidates) {
    alive()
    // Wide STEP tables are padded with long runs of spaces; collapse them so the slice holds more table and fewer blanks.
    const slice = c.text.slice(c.at, c.at + SLICE * 3).replace(/[ \t]{3,}/g, '  ').slice(0, SLICE)
    const key = `plan-extract-${o.extractor.model}-${c.doc.id}-${createHash('sha256').update(slice).digest('hex').slice(0, 16)}`
    let got = await o.io.cache.get<{ data: PlanExtract; tokens: number }>(key)
    if (!got) { got = await o.extractor.extract(o.projectId, slice); await o.io.cache.put(key, got) }
    tokens += got.tokens
    const { rows, dropped } = groundRows(o.projectId, c.doc, slice, got.data)
    if (!best || rows.length > best.rows.length) best = { doc: c.doc, rows, dropped }
  }
  return { rows: best?.rows ?? [], chosen: best?.doc ?? null, looked, withTable: candidates.length, dropped: best?.dropped ?? 0, tokens }
}

export const planSource = (doc: PlanDoc, rows: number, model: string, total: number, dropped: number) => ({
  name: `Procurement Plan document ${doc.id} (${String(doc.docdt).slice(0, 10)})`, url: doc.pdfurl ?? doc.txturl, records: rows,
  note: `Newest of ${total} plan documents with a readable package table. First ${rows} package rows read by ${model}; ${dropped} rows dropped because their reference, description or cost was not found in the text. Values are copied as written.`,
})
