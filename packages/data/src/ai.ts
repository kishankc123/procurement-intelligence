// Pure helpers behind the Work with AI page. No React, no fetch: easy to test and to explain.
import { KNOWN_SOURCE_HOSTS } from '@pi/config'
import type { Chunk, Contract, Doc, IngestionStep, Project, SourceLink, SupervisionReport } from './schemas'

export interface UrlCheck { ok: boolean; url: string | null; host: string | null; problems: string[]; warnings: string[] }

/** Type check for a pasted link: shape and scheme only. Whether the server answers is checked separately. */
export function checkSourceUrl(raw: string): UrlCheck {
  const text = raw.trim()
  const fail = (problem: string): UrlCheck => ({ ok: false, url: null, host: null, problems: [problem], warnings: [] })
  if (!text) return fail('Paste a link first.')
  if (text.length > 2048) return fail('The link is longer than 2048 characters.')
  let u: URL
  try { u = new URL(text) } catch { return fail('This is not a valid web address. Start it with https://') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return fail(`Only http and https links are accepted, not ${u.protocol.replace(':', '')}.`)
  if (u.username || u.password) return fail('Links with a username or password are not accepted.')
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || !host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return fail('Use a public web address, not localhost or an IP address.')
  }
  return { ok: true, url: u.toString(), host, problems: [], warnings: u.protocol === 'http:' ? ['This link is not encrypted (http).'] : [] }
}

/** Which known public publisher a host belongs to, or null. */
export function classifySource(host: string): { publisher: string; kind: string } | null {
  const h = host.toLowerCase()
  const hit = KNOWN_SOURCE_HOSTS.find((k) => h === k.host || h.endsWith(`.${k.host}`))
  return hit ? { publisher: hit.publisher, kind: hit.kind } : null
}

/**
 * Steps of one simulated ingestion run for a saved link. Nothing is downloaded or read:
 * the steps report what the stored checks show, and extraction is marked as not built.
 */
export function ingestionSteps(link: SourceLink): IngestionStep[] {
  const reachable = link.reachability === 'reachable'
  return [
    { id: 'validate', label: 'Validate link', status: 'done', detail: `${link.host} is a well-formed ${link.url.startsWith('https') ? 'https' : 'http'} address.` },
    { id: 'reach', label: 'Check the server answers', status: reachable ? 'done' : 'failed',
      detail: reachable ? 'The server answered. The browser cannot read its status or content.' : 'No answer from the server. Check the address and try again.' },
    { id: 'classify', label: 'Recognise the publisher', status: link.publisher ? 'done' : 'skipped',
      detail: link.publisher ? `${link.publisher}: ${link.kind}.` : 'Not a publisher this demo knows, so the source stays unclassified.' },
    { id: 'extract', label: 'Extract text and tables', status: 'planned', detail: 'Not built in this demo. A real run would parse the page or PDF here; nothing was read.' },
    { id: 'link', label: 'Link to project records', status: 'done', detail: 'Uses the records and documents already loaded for this project (see the next layer).' },
  ]
}

export type LinkReason = 'contract_reference' | 'report_date' | 'project_mention'
export interface RecordLink {
  id: string
  reason: LinkReason
  why: string
  structured: { type: 'contract' | 'supervision_report'; id: string; label: string }
  chunk: Chunk
  doc: Doc | undefined
}

/**
 * Connect structured records (contracts, supervision reports) with unstructured text (document chunks) of one project.
 * Rules, strongest first:
 *  - a chunk names a contract reference number  -> contract_reference
 *  - a report and a document share the project and the date  -> report_date
 *  - a chunk names the project id or project name  -> project_mention
 */
export function linkRecords(input: { project: Project; contracts: Contract[]; reports: SupervisionReport[]; docs: Doc[]; chunks: Chunk[] }): RecordLink[] {
  const { project, contracts, reports, docs, chunks } = input
  const projectDocs = docs.filter((d) => d.project_id === project.project_id)
  const docById = new Map(projectDocs.map((d) => [d.doc_id, d]))
  const projectChunks = chunks.filter((c) => docById.has(c.doc_id))
  const out: RecordLink[] = []

  for (const c of projectChunks) {
    const doc = docById.get(c.doc_id)
    for (const k of contracts) {
      const ref = k.borrower_contract_reference_number
      if (c.text.includes(ref)) {
        out.push({ id: `${ref}:${c.chunk_id}`, reason: 'contract_reference', why: `The text names contract ${ref}.`, structured: { type: 'contract', id: ref, label: `${ref} · ${k.supplier}` }, chunk: c, doc })
      }
    }
    for (const r of reports) {
      if (doc && doc.date === r.date) {
        out.push({ id: `${r.id}:${c.chunk_id}`, reason: 'report_date', why: `Same project and same date (${r.date}) as supervision report ${r.sequence}.`, structured: { type: 'supervision_report', id: r.id, label: `Supervision report ${r.sequence}` }, chunk: c, doc })
      }
    }
    const lower = c.text.toLowerCase()
    if (lower.includes(project.project_id.toLowerCase()) || lower.includes(project.project_name.toLowerCase())) {
      out.push({ id: `${project.project_id}:${c.chunk_id}`, reason: 'project_mention', why: 'The text names this project by id or name.', structured: { type: 'contract', id: project.project_id, label: project.project_name }, chunk: c, doc })
    }
  }
  return out
}

export interface RecordGroup { key: string; structured: RecordLink['structured']; links: RecordLink[] }

/** One entry per structured record, with every document text linked to it, in the order the records first appear. */
export function groupLinksByRecord(links: RecordLink[]): RecordGroup[] {
  const groups = new Map<string, RecordGroup>()
  for (const l of links) {
    const key = `${l.structured.type}:${l.structured.id}`
    const group = groups.get(key)
    if (group) group.links.push(l)
    else groups.set(key, { key, structured: l.structured, links: [l] })
  }
  return [...groups.values()]
}
