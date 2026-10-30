// The ingestion of one real World Bank project as a function: find the project, read its contract awards and documents, parse the supervision
// reports, chunk the texts and (when an embedder is given) embed the chunks. Every step reports what it is doing through `onEvent`, so the CLI
// logs it and the chat card draws it. All network, cache and model access comes in through `PipelineIo`, so tests run on fixtures.
import { createHash } from 'node:crypto'
import { INGEST_STAGE_LABEL, isProjectId, type IngestEvent, type IngestStage, type IngestSummary } from '../packages/data/src/ingestEvents'
import { packVectors, pca2, unpackVectors } from '../packages/data/src/vectors'
import { apiDateToIso, chunkText, dmyToIso, parseIsr, RATING_CODE } from './parse'

export interface PipelineIo {
  getJson(url: string): Promise<any>
  getText(url: string): Promise<string>
  cache: { get<T>(key: string): T | undefined; put(key: string, value: unknown): void }
}

export interface Embedder {
  model: string
  dimensions: number
  usdPer1MTokens: number
  /** Embeds a batch of texts; the vectors come back in the same order. */
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }>
}

export interface EmbeddedSet {
  model: string
  dimensions: number
  chunk_ids: string[]
  hashes: string[]
  /** The packed int8 file (see vectors.ts). */
  bytes: Uint8Array
  tokens: number
  costUsd: number
  reused: number
}

export interface PipelineOptions {
  io: PipelineIo
  onEvent?: (e: IngestEvent) => void
  signal?: AbortSignal
  embedder?: Embedder | null
  /** Why there is no embedder (shown on the card), for example "OPENAI_API_KEY is not set". */
  noEmbedderReason?: string
  /** Vectors from an earlier run, by chunk id, so unchanged chunks are not paid for twice. */
  previous?: Map<string, { hash: string; vector: number[] }>
  contractPageSize?: number
  contractConcurrency?: number
  embedBatch?: number
  /** Upper bound on chunks sent to the embedding model for one project. */
  maxEmbedChunks?: number
  now?: () => Date
}

export interface PipelineResult {
  snapshot: { manifest: Record<string, unknown>; collections: Record<string, unknown[]> }
  embeddings: EmbeddedSet | null
  summary: IngestSummary
}

const CONTRACTS_API = 'https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005&resourceId=RS00005&type=json'
export const projectsApiUrl = (id: string) => `https://search.worldbank.org/api/v2/projects?format=json&rows=1&id=${id}&fl=*`
const docsApiUrl = (id: string) => `https://search.worldbank.org/api/v3/wds?format=json&rows=500&proid=${id}&fl=id,docty,docdt,display_title,txturl,pdfurl`

interface RawContract {
  borrower_contract_reference_number: string; wb_contract_number: string; project_id: string; supplier: string; supplier_id: string | number | null
  supplier_country: string; procurement_category: string; procurement_method: string; review_type: string; supplier_contract_amount_usd: number | string
  contract_signing_date: string; fiscal_year: number; contract_description: string; project_global_practice: string; borrower_country: string; borrower_country_code: string; region: string
}
interface RawDoc { id: string; docty?: string; docdt?: string; display_title?: string; txturl?: string; pdfurl?: string }

export class Cancelled extends Error { constructor() { super('Cancelled'); this.name = 'Cancelled' } }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
export const hashText = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)

export async function ingestProject(projectId: string, opts: PipelineOptions): Promise<PipelineResult> {
  if (!isProjectId(projectId)) throw new Error(`"${projectId}" is not a World Bank project id (expected P followed by six digits)`)
  const { io, signal } = opts
  const emit = (e: IngestEvent) => opts.onEvent?.(e)
  const now = opts.now ?? (() => new Date())
  const t0 = Date.now()
  const alive = () => { if (signal?.aborted) throw new Cancelled() }
  let current: IngestStage = 'find'
  const stage = async <T,>(id: IngestStage, work: () => Promise<T>, detail?: (r: T) => string): Promise<T> => {
    alive(); current = id
    emit({ type: 'stage', stage: id, status: 'running' })
    const r = await work()
    emit({ type: 'stage', stage: id, status: 'done', detail: detail?.(r) })
    return r
  }
  const cached = async <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = io.cache.get<T>(key)
    if (hit !== undefined) return hit
    const value = await load()
    io.cache.put(key, value)
    return value
  }
  const notes: string[] = []
  const fetchedAt = now().toISOString()

  try {
    // 1-2. Project record
    const project = await stage('find', () => cached(`project-${projectId}`, async () => Object.values((await io.getJson(projectsApiUrl(projectId))).projects as Record<string, any>)[0]),
      (p) => (p ? String(p.project_name).replace(/\s+/g, ' ') : ''))
    if (!project) throw new Error(`The Projects API has no project ${projectId}`)
    emit({ type: 'log', text: `Found ${String(project.project_name).replace(/\s+/g, ' ')} (${project.status})` })
    await stage('project', async () => project, () => `${String(Array.isArray(project.countryname) ? project.countryname[0] : project.countryname)} · ${project.status}`)

    // 3. Contract awards. The API ignores filters, so every page is read and this project's rows are kept; pages are cached, so only the first project pays.
    const pageSize = opts.contractPageSize ?? 1000
    const raw = await stage('contracts', () => cached(`contracts-${projectId}`, () => scanContracts(projectId, io, pageSize, opts.contractConcurrency ?? 5, emit, alive)),
      (rows) => `${rows.length} contract awards`)
    const contracts = raw.map((r) => ({
      borrower_contract_reference_number: String(r.borrower_contract_reference_number),
      wb_contract_number: String(r.wb_contract_number ?? ''),
      project_id: projectId,
      supplier: String(r.supplier ?? 'Not reported'),
      supplier_id: r.supplier_id !== null && r.supplier_id !== undefined && String(r.supplier_id) !== '' ? String(r.supplier_id) : `NAME-${slug(String(r.supplier ?? 'unknown'))}`,
      supplier_country: String(r.supplier_country ?? 'Not reported'),
      procurement_category: String(r.procurement_category ?? 'Not reported'),
      procurement_method: String(r.procurement_method ?? 'Not reported'),
      review_type: String(r.review_type ?? 'Not reported'),
      supplier_contract_amount_usd: Number(r.supplier_contract_amount_usd) || 0,
      contract_signing_date: dmyToIso(r.contract_signing_date) ?? apiDateToIso(r.contract_signing_date) ?? '',
      fiscal_year: Number(r.fiscal_year),
      contract_description: String(r.contract_description ?? ''),
    })).filter((c) => c.contract_signing_date !== '')
    if (contracts.length !== raw.length) notes.push(`${raw.length - contracts.length} contract rows had no readable signing date and were left out.`)
    const noSupplierId = raw.filter((r) => r.supplier_id === null || r.supplier_id === undefined || String(r.supplier_id) === '').length
    if (noSupplierId > 0) notes.push(`${noSupplierId} contract rows have no supplier id in the source; their id is built from the supplier name (NAME-...).`)
    const refCounts = new Map<string, number>()
    for (const c of contracts) refCounts.set(c.borrower_contract_reference_number, (refCounts.get(c.borrower_contract_reference_number) ?? 0) + 1)
    const repeated = [...refCounts.values()].filter((n) => n > 1).length
    if (repeated > 0) notes.push(`${repeated} contract reference numbers appear more than once in the source (joint ventures are split into one row per member).`)

    // 4. Documents: the supervision reports, the completion report(s), the appraisal document, and the latest procurement plan
    const plan = await stage('documents', async () => {
      const docsRaw = await cached(`documents-${projectId}`, async () => Object.values((await io.getJson(docsApiUrl(projectId))).documents as Record<string, RawDoc>))
      const byType = (t: string) => docsRaw.filter((d) => d.docty === t && d.docdt && d.txturl)
      const newest = (xs: RawDoc[]) => [...xs].sort((a, b) => (b.docdt ?? '').localeCompare(a.docdt ?? ''))
      const isrs = newest(byType('Implementation Status and Results Report'))
      const icrs = newest(byType('Implementation Completion and Results Report'))
      const icrReviews = newest(byType('Implementation Completion Report Review'))
      const pads = newest(byType('Project Appraisal Document')).slice(0, 1)
      const plans = newest(byType('Procurement Plan'))
      const withText = [...isrs, ...icrs.slice(0, 1), ...plans.slice(0, 1)]
      const listed = [...isrs, ...icrs.slice(0, 1), ...icrReviews.slice(0, 1), ...pads, ...plans.slice(0, 1)]
      for (const d of listed) emit({ type: 'item', stage: 'documents', id: `DOC-WB-${d.id}`, label: String(d.display_title ?? d.docty).replace(/\s+/g, ' ').trim(), group: d.docty })
      return { docsRaw, isrs, pads, plans, withText, listed }
    }, (p) => `${p.listed.length} of ${p.docsRaw.length} documents to ingest`)
    const { docsRaw, isrs, pads, plans, withText, listed } = plan
    if (plans.length > 1) notes.push(`${plans.length - 1} older procurement plan versions exist and were not ingested; only the latest is.`)
    notes.push(`${docsRaw.length - listed.length} other documents exist for this project (other types and older versions) and were not ingested.`)

    // 5. Document texts
    const texts = new Map<string, string>()
    await stage('texts', async () => {
      let n = 0
      for (const d of withText) {
        alive()
        texts.set(d.id, await cached(`text-${d.id}`, () => io.getText(d.txturl!)))
        emit({ type: 'progress', stage: 'texts', done: ++n, total: withText.length, found: texts.size })
      }
    }, () => `${texts.size} document texts read`)

    // 6. Supervision reports, read without a model
    const supervisionReports: unknown[] = []
    const unparsed: { doc_id: string; date: string; problems: string[] }[] = []
    const usedIsrIds = new Set<string>()
    const parsedIsrs: { doc: RawDoc; parse: ReturnType<typeof parseIsr> }[] = []
    await stage('parse', async () => {
      let n = 0
      for (const d of isrs) {
        alive()
        const p = parseIsr(texts.get(d.id) ?? '')
        parsedIsrs.push({ doc: d, parse: p })
        const code = (name: string | null) => (name ? RATING_CODE[name] ?? null : null)
        const ok = p.sequence !== null && code(p.progress.current) && code(p.implementation.current) && p.risk.current && p.disbursedPct !== null
        if (!ok) {
          unparsed.push({ doc_id: `DOC-WB-${d.id}`, date: apiDateToIso(d.docdt) ?? '', problems: p.problems })
          emit({ type: 'item', stage: 'parse', id: `DOC-WB-${d.id}`, label: `${p.sequence ? `Report ${p.sequence}` : 'A report'} could not be fully read (${p.problems[0] ?? 'unknown layout'})`, ok: false })
        } else {
          // Two documents can carry the same sequence number (a re-issued report); keep the first id as it is and make later ones unique.
          const baseId = `ISR-WB-${projectId}-${p.sequence}`
          const id = usedIsrIds.has(baseId) ? `${baseId}-${d.id}` : baseId
          usedIsrIds.add(id)
          supervisionReports.push({
            id, project_id: projectId, sequence: p.sequence, date: apiDateToIso(d.docdt),
            progress_rating_prev: code(p.progress.previous), progress_rating: code(p.progress.current),
            implementation_rating: code(p.implementation.current),
            overall_risk_prev: p.risk.previous, overall_risk: p.risk.current,
            fiduciary_risk: p.fiduciary ?? 'Not reported', disbursed_pct: p.disbursedPct, restructurings: p.restructurings,
          })
          emit({ type: 'item', stage: 'parse', id, label: `Report ${p.sequence} · ${p.progress.current ?? '?'} · risk ${p.risk.current}`, ok: true })
        }
        emit({ type: 'progress', stage: 'parse', done: ++n, total: isrs.length, found: supervisionReports.length })
      }
    }, () => `${supervisionReports.length} of ${isrs.length} reports read`)
    if (unparsed.length) notes.push(`${unparsed.length} supervision reports could not be fully read by the parser and are left out of supervision_reports: ${unparsed.map((u) => u.date).join(', ')}.`)

    // The project record, with key dates from the newest report that has them
    const dates = parsedIsrs.find((x) => x.parse.keyDates?.effectiveness)?.parse.keyDates ?? null
    const practiceFromContracts = raw[0]?.project_global_practice
    const projectRecord = {
      project_id: projectId,
      project_name: String(project.project_name).replace(/\s+/g, ' ').trim(),
      borrower_country: String(Array.isArray(project.countryname) ? project.countryname[0] : project.countryname),
      borrower_country_code: String(Array.isArray(project.countrycode) ? project.countrycode[0] : project.countrycode),
      region: String(project.regionname ?? raw[0]?.region ?? 'Not reported'),
      project_global_practice: String(practiceFromContracts ?? project.mjsector?.[0]?.Name ?? 'Not reported'),
      approval_date: dates?.approval ?? apiDateToIso(project.boardapprovaldate) ?? '',
      effectiveness_planned: dates?.effectiveness ?? '',
      effectiveness_actual: dates?.effectiveness ?? null,
      closing_date_planned: dates?.originalClosing ?? apiDateToIso(project.closingdate) ?? '',
      closing_date_revised: dates?.revisedClosing ?? null,
    }
    if (!dates) notes.push('No supervision report gave the key dates, so effectiveness and original closing dates are missing.')
    else notes.push('The planned effectiveness date is not published; the actual effectiveness date is used for both. Original and revised closing dates come from the newest supervision report.')

    // 7. Documents and chunks
    const documents: unknown[] = []
    const chunks: { chunk_id: string; doc_id: string; page: number; section_path: string; strategy: string; token_count: number; text: string; embedding_status: string }[] = []
    const docTypeOf = new Map<string, string>()
    await stage('chunk', async () => {
      for (const d of listed) {
        alive()
        const docId = `DOC-WB-${d.id}`
        const text = texts.get(d.id)
        let pages = 0, made = 0
        if (text) {
          const { pieces, exactPages, pages: n } = chunkText(text)
          pages = n
          pieces.forEach((piece, i) => chunks.push({
            chunk_id: `CH-WB-${d.id}-${String(i + 1).padStart(3, '0')}`, doc_id: docId, page: piece.page, section_path: piece.section,
            strategy: exactPages ? 'section-aware, exact pages' : 'section-aware, page estimated', token_count: Math.round(piece.text.split(/\s+/).length * 1.3), text: piece.text, embedding_status: 'none',
          }))
          made = pieces.length
        }
        docTypeOf.set(docId, String(d.docty ?? 'Document'))
        documents.push({
          doc_id: docId, project_id: projectId, type: d.docty, title: String(d.display_title ?? d.docty).replace(/\s+/g, ' ').trim(),
          date: apiDateToIso(d.docdt) ?? '', pages, parse_status: text ? 'parsed' : 'pending',
        })
        emit({ type: 'item', stage: 'chunk', id: docId, label: String(d.display_title ?? d.docty).replace(/\s+/g, ' ').trim(), group: d.docty, count: made })
        emit({ type: 'progress', stage: 'chunk', done: documents.length, total: listed.length, found: chunks.length })
      }
    }, () => `${chunks.length} chunks in ${documents.length} documents`)
    if (pads.length > 0) notes.push('The appraisal document is registered but its text was not ingested (pending).')

    // 8. Embeddings
    let embeddings: EmbeddedSet | null = null
    let embedding: IngestSummary['embedding'] = null
    let map: IngestSummary['map'] = null
    let sample: IngestSummary['sample'] = null
    alive(); current = 'embed'
    const embedder = opts.embedder
    const cap = opts.maxEmbedChunks ?? 3000
    if (!embedder || chunks.length === 0) {
      const reason = !embedder ? (opts.noEmbedderReason ?? 'No embedding model is configured') : 'There is nothing to embed'
      emit({ type: 'stage', stage: 'embed', status: 'skipped', detail: reason })
      embedding = { status: 'skipped', reason }
    } else {
      emit({ type: 'stage', stage: 'embed', status: 'running' })
      const targets = chunks.slice(0, cap)
      if (chunks.length > cap) notes.push(`Only the first ${cap} of ${chunks.length} chunks were embedded (the cap per project).`)
      const hashes = targets.map((c) => hashText(c.text))
      const vectors: number[][] = new Array(targets.length)
      const todo: number[] = []
      targets.forEach((c, i) => {
        const old = opts.previous?.get(c.chunk_id)
        if (old && old.hash === hashes[i] && old.vector.length === embedder.dimensions) vectors[i] = old.vector
        else todo.push(i)
      })
      const reused = targets.length - todo.length
      const size = opts.embedBatch ?? 100
      const batches = Math.ceil(todo.length / size)
      let tokens = 0
      emit({ type: 'progress', stage: 'embed', done: 0, total: batches, found: reused, note: reused ? `${reused} reused from an earlier run` : undefined })
      for (let b = 0; b < batches; b++) {
        alive()
        const idx = todo.slice(b * size, (b + 1) * size)
        const out = await embedder.embed(idx.map((i) => targets[i]!.text))
        if (out.vectors.length !== idx.length) throw new Error(`The embedding model returned ${out.vectors.length} vectors for ${idx.length} texts`)
        idx.forEach((i, k) => { vectors[i] = out.vectors[k]! })
        tokens += out.tokens
        emit({ type: 'progress', stage: 'embed', done: b + 1, total: batches, found: reused + Math.min(todo.length, (b + 1) * size), note: `${tokens.toLocaleString('en-US')} tokens` })
      }
      const packed = packVectors(vectors)
      const costUsd = (tokens / 1_000_000) * embedder.usdPer1MTokens
      embeddings = { model: embedder.model, dimensions: embedder.dimensions, chunk_ids: targets.map((c) => c.chunk_id), hashes, bytes: packed.bytes, tokens, costUsd, reused }
      targets.forEach((c) => { c.embedding_status = 'embedded' })
      const stored = unpackVectors(packed.bytes, packed.count, packed.dimensions)
      const points = pca2(stored)
      sample = { chunk_id: targets[0]!.chunk_id, total: embedder.dimensions, values: Array.from(stored[0]!.slice(0, 32), (x) => Math.round(x * 1e4) / 1e4) }
      map = points.map(([x, y], i) => ({ chunk_id: targets[i]!.chunk_id, doc_type: docTypeOf.get(targets[i]!.doc_id) ?? 'Document', x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }))
      embedding = { status: 'done', model: embedder.model, dimensions: embedder.dimensions, vectors: targets.length, tokens, costUsd, reused }
      emit({ type: 'stage', stage: 'embed', status: 'done', detail: `${targets.length} vectors (${reused} reused)` })
    }

    // 9. Snapshot (the caller writes and publishes it)
    alive(); current = 'publish'
    emit({ type: 'stage', stage: 'publish', status: 'running' })
    const day = fetchedAt.slice(0, 10)
    const sources = [
      { id: 'SRC-WB-PROJECTS', name: 'World Bank Projects API', publisher: 'World Bank', kind: 'Project records', status: 'fetched', last_fetched: day, simulated: false },
      { id: 'SRC-WB-CONTRACTS', name: 'Contract Awards in Investment Project Financing (Finances One, DS00005)', publisher: 'World Bank', kind: 'Contract awards', status: 'fetched', last_fetched: day, simulated: false },
      { id: 'SRC-WB-DOCUMENTS', name: 'World Bank Documents & Reports API', publisher: 'World Bank', kind: 'Project documents', status: 'fetched', last_fetched: day, simulated: false },
    ]
    const counts = { contracts: contracts.length, documents: documents.length, documents_with_text: withText.length, chunks: chunks.length, supervision_reports: supervisionReports.length }
    const snapshot = {
      manifest: {
        project_id: projectId, project_name: projectRecord.project_name, ingested_at: fetchedAt, stage: 'structured',
        sources: [
          { name: 'Projects API', url: projectsApiUrl(projectId), records: 1 },
          { name: 'Contract Awards API (DS00005)', url: `${CONTRACTS_API}&top=${pageSize}&skip=<page>`, records: contracts.length, note: 'All pages read; rows for this project kept.' },
          { name: 'Documents & Reports API', url: docsApiUrl(projectId), records: docsRaw.length, note: `${listed.length} ingested.` },
        ],
        counts,
        not_done: [
          'Completion report lessons (needs a model): lessons are not extracted yet.',
          'Procurement plan packages (needs a model): plans are not extracted yet.',
          'Tender drafts, bidder counts, bid dates and amendments are not in any public structured source.',
        ],
        supervision_reports_unparsed: unparsed,
        notes,
        license: 'World Bank open data (CC BY 4.0) with attribution to the World Bank. The completion report text may be a disclosed draft; check its status before sharing.',
      },
      collections: { projects: [projectRecord], contracts, documents, chunks, supervision_reports: supervisionReports, sources } as Record<string, unknown[]>,
    }
    const summary: IngestSummary = { projectId, projectName: projectRecord.project_name, counts, embedding, map, sample, notes, durationMs: Date.now() - t0 }
    return { snapshot, embeddings, summary }
  } catch (e) {
    if (e instanceof Cancelled) { emit({ type: 'error', stage: current, message: 'Cancelled by the user', cancelled: true }); throw e }
    emit({ type: 'error', stage: current, message: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

async function scanContracts(projectId: string, io: PipelineIo, pageSize: number, concurrency: number, emit: (e: IngestEvent) => void, alive: () => void): Promise<RawContract[]> {
  const url = (skip: number) => `${CONTRACTS_API}&top=${pageSize}&skip=${skip}`
  const key = (n: number) => `contracts-page-${pageSize}-${n}`
  const first = await io.getJson(url(0))
  const total = Number(first.count)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  io.cache.put(key(0), { data: first.data })
  emit({ type: 'log', text: `Contract awards: ${total.toLocaleString('en-US')} records in ${pages} pages; reading them all to find this project` })
  // Rows are kept per page and joined in page order, so the result does not depend on which page finished first.
  const found: RawContract[][] = Array.from({ length: pages }, () => [])
  found[0] = (first.data as RawContract[]).filter((r) => r.project_id === projectId)
  let next = 1, done = 1, count = found[0].length
  emit({ type: 'progress', stage: 'contracts', done, total: pages, found: count })
  const worker = async () => {
    while (next < pages) {
      alive()
      const n = next++
      const hit = io.cache.get<{ data: RawContract[] }>(key(n))
      const rows = hit ? hit.data : ((await io.getJson(url(n * pageSize))).data as RawContract[])
      if (!hit) io.cache.put(key(n), { data: rows })
      found[n] = rows.filter((r) => r.project_id === projectId)
      count += found[n]!.length
      emit({ type: 'progress', stage: 'contracts', done: ++done, total: pages, found: count })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pages) }, worker))
  return found.flat()
}

export const stageLabel = (s: IngestStage) => INGEST_STAGE_LABEL[s]
