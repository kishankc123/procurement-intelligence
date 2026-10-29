// Pre-ingestion of one real World Bank project into a stored snapshot (mock/ingested/<project>.json), in the same shape as mock/db.json.
//   pnpm ingest P158504          fetch, parse, write the snapshot (reuses ingest/cache, so a second run is quick)
//   pnpm ingest P158504 --fresh  ignore the cache and fetch everything again
// Sources are the public World Bank APIs: Projects, Contract Awards (Finances One) and Documents & Reports. Nothing here uses a model;
// the parts that need one (lessons, procurement plans) are a later stage and are listed in the manifest as not done.
// @ts-ignore Node.js type declarations are not included for this script.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
// @ts-ignore Node.js type declarations are not included for this script.
import { dirname, join } from 'node:path'
// @ts-ignore Node.js type declarations are not included for this script.
import { fileURLToPath } from 'node:url'
import { apiDateToIso, chunkText, dmyToIso, parseIsr, RATING_CODE } from './parse'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'ingest', 'cache')
const outDir = join(root, 'mock', 'ingested')
declare const process: { argv: string[]; exit: (code: number) => never }

const args = process.argv.slice(2)
const projectId = args.find((a) => /^P\d{6}$/.test(a))
const fresh = args.includes('--fresh')
if (!projectId) { console.error('Usage: pnpm ingest P158504 [--fresh]'); process.exit(1) }

const log = (msg: string) => console.log(`[ingest ${projectId}] ${msg}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const file = join(cacheDir, `${key}.json`)
  if (!fresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T
  const value = await load()
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(file, JSON.stringify(value))
  return value
}

async function getJson(url: string, tries = 4): Promise<any> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return await res.json()
    } catch (e) {
      if (i >= tries) throw new Error(`Could not read ${url.slice(0, 90)}: ${e instanceof Error ? e.message : e}`)
      await sleep(1500 * i)
    }
  }
}
async function getText(url: string, tries = 4): Promise<string> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url.replace('http://', 'https://'))
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return await res.text()
    } catch (e) {
      if (i >= tries) throw new Error(`Could not read ${url.slice(0, 90)}: ${e instanceof Error ? e.message : e}`)
      await sleep(1500 * i)
    }
  }
}

// ---------------------------------------------------------------- sources
const PROJECTS_API = `https://search.worldbank.org/api/v2/projects?format=json&rows=1&id=${projectId}&fl=*`
const CONTRACTS_API = 'https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005&resourceId=RS00005&type=json&top=1000&skip='
const DOCS_API = `https://search.worldbank.org/api/v3/wds?format=json&rows=500&proid=${projectId}&fl=id,docty,docdt,display_title,txturl,pdfurl`

interface RawContract {
  borrower_contract_reference_number: string; wb_contract_number: string; project_id: string; supplier: string; supplier_id: string | number | null
  supplier_country: string; procurement_category: string; procurement_method: string; review_type: string; supplier_contract_amount_usd: number | string
  contract_signing_date: string; fiscal_year: number; contract_description: string; project_global_practice: string; borrower_country: string; borrower_country_code: string; region: string
}
interface RawDoc { id: string; docty?: string; docdt?: string; display_title?: string; txturl?: string; pdfurl?: string }

/** The contract API ignores filters, so every page is read and this project's rows are kept (a few minutes, once; cached). */
async function scanContracts(): Promise<RawContract[]> {
  const first = await getJson(`${CONTRACTS_API}0`)
  const total = Number(first.count)
  const pages = Math.ceil(total / 1000)
  log(`contract awards: ${total} records in ${pages} pages, reading them all to find this project`)
  const rows: RawContract[] = (first.data as RawContract[]).filter((r) => r.project_id === projectId)
  let next = 1, done = 1
  const worker = async () => {
    while (next < pages) {
      const page = next++
      const data = (await getJson(`${CONTRACTS_API}${page * 1000}`)).data as RawContract[]
      rows.push(...data.filter((r) => r.project_id === projectId))
      if (++done % 40 === 0 || done === pages) log(`  page ${done} of ${pages}, ${rows.length} contracts so far`)
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  return rows
}

async function main() {
  const fetchedAt = new Date().toISOString()
  const notes: string[] = []

  // 1. Project record
  const project = await cached(`project-${projectId}`, async () => Object.values((await getJson(PROJECTS_API)).projects as Record<string, any>)[0])
  if (!project) throw new Error(`The Projects API has no project ${projectId}`)
  log(`project: ${String(project.project_name).replace(/\s+/g, ' ')} (${project.status})`)

  // 2. Contract awards
  const raw = await cached(`contracts-${projectId}`, scanContracts)
  log(`contract awards for this project: ${raw.length}`)
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

  // 3. Documents: the supervision reports, the completion report(s), the appraisal document, and the latest procurement plan
  const docsRaw = await cached(`documents-${projectId}`, async () => Object.values((await getJson(DOCS_API)).documents as Record<string, RawDoc>))
  const byType = (t: string) => docsRaw.filter((d) => d.docty === t && d.docdt && d.txturl)
  const newest = (xs: RawDoc[]) => [...xs].sort((a, b) => (b.docdt ?? '').localeCompare(a.docdt ?? ''))
  const isrs = newest(byType('Implementation Status and Results Report'))
  const icrs = newest(byType('Implementation Completion and Results Report'))
  const icrReviews = newest(byType('Implementation Completion Report Review'))
  const pads = newest(byType('Project Appraisal Document')).slice(0, 1)
  const plans = newest(byType('Procurement Plan'))
  const withText = [...isrs, ...icrs.slice(0, 1), ...plans.slice(0, 1)]
  const listed = [...isrs, ...icrs.slice(0, 1), ...icrReviews.slice(0, 1), ...pads, ...plans.slice(0, 1)]
  log(`documents: ${docsRaw.length} on record; ingesting ${listed.length} (${withText.length} with text)`)
  if (plans.length > 1) notes.push(`${plans.length - 1} older procurement plan versions exist and were not ingested; only the latest is.`)
  notes.push(`${docsRaw.length - listed.length} other documents exist for this project (other types and older versions) and were not ingested.`)

  const texts = new Map<string, string>()
  let fetched = 0
  for (const d of withText) {
    texts.set(d.id, await cached(`text-${d.id}`, () => getText(d.txturl!)))
    if (++fetched % 6 === 0) log(`  read ${fetched} of ${withText.length} document texts`)
  }

  // 4. Supervision reports, read without a model
  const supervisionReports: unknown[] = []
  const unparsed: { doc_id: string; date: string; problems: string[] }[] = []
  const usedIsrIds = new Set<string>()
  const parsedIsrs: { doc: RawDoc; parse: ReturnType<typeof parseIsr> }[] = []
  for (const d of isrs) {
    const p = parseIsr(texts.get(d.id) ?? '')
    parsedIsrs.push({ doc: d, parse: p })
    const code = (name: string | null) => (name ? RATING_CODE[name] ?? null : null)
    const ok = p.sequence !== null && code(p.progress.current) && code(p.implementation.current) && p.risk.current && p.disbursedPct !== null
    if (!ok) { unparsed.push({ doc_id: `DOC-WB-${d.id}`, date: apiDateToIso(d.docdt) ?? '', problems: p.problems }); continue }
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
  }
  log(`supervision reports read: ${supervisionReports.length} of ${isrs.length}${unparsed.length ? ` (${unparsed.length} need a second look)` : ''}`)
  if (unparsed.length) notes.push(`${unparsed.length} supervision reports could not be fully read by the parser and are left out of supervision_reports: ${unparsed.map((u) => u.date).join(', ')}.`)

  // 5. The project record, with key dates from the newest report that has them
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

  // 6. Documents and chunks
  const documents: unknown[] = []
  const chunks: unknown[] = []
  for (const d of listed) {
    const docId = `DOC-WB-${d.id}`
    const text = texts.get(d.id)
    let pages = 0
    if (text) {
      const { pieces, exactPages, pages: n } = chunkText(text)
      pages = n
      pieces.forEach((piece, i) => chunks.push({
        chunk_id: `CH-WB-${d.id}-${String(i + 1).padStart(3, '0')}`, doc_id: docId, page: piece.page, section_path: piece.section,
        strategy: exactPages ? 'section-aware, exact pages' : 'section-aware, page estimated', token_count: Math.round(piece.text.split(/\s+/).length * 1.3), text: piece.text, embedding_status: 'none',
      }))
    }
    documents.push({
      doc_id: docId, project_id: projectId, type: d.docty, title: String(d.display_title ?? d.docty).replace(/\s+/g, ' ').trim(),
      date: apiDateToIso(d.docdt) ?? '', pages, parse_status: text ? 'parsed' : 'pending',
    })
  }
  if (pads.length > 0) notes.push('The appraisal document is registered but its text was not ingested (pending).')

  // 7. Source registry entries for what was read
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
        { name: 'Projects API', url: PROJECTS_API, records: 1 },
        { name: 'Contract Awards API (DS00005)', url: CONTRACTS_API.replace(/skip=$/, 'skip=<page>'), records: contracts.length, note: 'All pages read; rows for this project kept.' },
        { name: 'Documents & Reports API', url: DOCS_API, records: docsRaw.length, note: `${listed.length} ingested.` },
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
    collections: { projects: [projectRecord], contracts, documents, chunks, supervision_reports: supervisionReports, sources },
  }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, `${projectId}.json`), JSON.stringify(snapshot, null, 1))
  log(`wrote mock/ingested/${projectId}.json: ${JSON.stringify(counts)}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
