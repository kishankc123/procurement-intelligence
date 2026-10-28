// Pure helpers for the retender check. No React, no fetch.
import { THRESHOLDS } from '@pi/config'
import type { Citation, Plan, TenderRecord } from './schemas'

export type TenderStatus = 'planned' | 'awarded' | 'cancelled' | 're_tendered'

/** One tender on record: an earlier tender from the history, or a plan that has not been advertised yet. */
export interface TenderCandidate {
  id: string
  name: string
  project_id: string
  kind: 'plan' | 'history'
  status: TenderStatus
  date: string | null
  reason: string | null
  /** Other ids this tender is known by, e.g. the contract reference of an awarded tender. */
  aliases: string[]
  citation: Citation | null
}

export function tenderCandidates(history: TenderRecord[], plans: Plan[]): TenderCandidate[] {
  return [
    ...history.map((h): TenderCandidate => ({
      id: h.id, name: h.name, project_id: h.project_id, kind: 'history', status: h.status, date: h.date, reason: h.reason,
      aliases: h.contract_ref ? [h.contract_ref] : [], citation: h.citation,
    })),
    ...plans.map((p): TenderCandidate => ({
      id: p.id, name: p.name, project_id: p.project_id, kind: 'plan', status: 'planned', date: p.planned_advertisement, reason: null, aliases: [],
      citation: { ref_type: 'record', ref_id: p.id, label: `Plan · ${p.name}` },
    })),
  ]
}

export type MatchKind = 'same_id' | 'same_name' | 'similar_name' | 'numbered_variant'

export interface RetenderMatch { candidate: TenderCandidate; kind: MatchKind; similarity: number | null; why: string }

export interface RetenderResult {
  query: string
  /** How many tenders on record were compared. */
  compared: number
  matches: RetenderMatch[]
  verdict: { tone: 'ok' | 'attention' | 'info'; text: string }
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'to', 'in'])
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t && !STOP.has(t))
const idKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const isNumber = (t: string) => /^\d+$/.test(t)
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((t) => b.has(t))

const RANK: Record<MatchKind, number> = { same_id: 0, same_name: 1, similar_name: 2, numbered_variant: 3 }
const STATUS_WORD: Record<TenderStatus, string> = { planned: 'planned', awarded: 'awarded', cancelled: 'cancelled', re_tendered: 're-tendered' }

/**
 * Has this tender been done, planned or cancelled before? Compares a tender id or name with the tenders on record:
 *  - same id (or the contract reference it was awarded as)
 *  - same name after ignoring case, punctuation and filler words
 *  - similar name: at least `retenderNameSimilarity` of the words are shared
 *  - numbered variant: the same name with a different number, such as another lot
 * Only the records passed in are searched, and the result says how many that was.
 */
export function checkRetender(query: string, candidates: TenderCandidate[], opts: { excludeIds?: string[] } = {}): RetenderResult {
  const pool = candidates.filter((c) => !(opts.excludeIds ?? []).includes(c.id))
  const q = tokens(query)
  const qSet = new Set(q)
  const qKey = idKey(query)
  if (!qKey) return { query, compared: pool.length, matches: [], verdict: { tone: 'info', text: 'Enter a tender id or name to check.' } }
  const qWords = new Set(q.filter((t) => !isNumber(t)))

  const matches: RetenderMatch[] = []
  for (const c of pool) {
    const ids = [c.id, ...c.aliases]
    if (ids.some((i) => idKey(i) === qKey)) {
      matches.push({ candidate: c, kind: 'same_id', similarity: null, why: `The id matches ${ids.find((i) => idKey(i) === qKey)}.` })
      continue
    }
    const cSet = new Set(tokens(c.name))
    if (cSet.size === 0 || qSet.size === 0) continue
    if (sameSet(qSet, cSet)) { matches.push({ candidate: c, kind: 'same_name', similarity: 1, why: 'The name is the same.' }); continue }
    const cWords = new Set([...cSet].filter((t) => !isNumber(t)))
    if (qWords.size > 0 && sameSet(qWords, cWords)) {
      matches.push({ candidate: c, kind: 'numbered_variant', similarity: null, why: 'The name is the same except for a number, such as another lot.' })
      continue
    }
    const shared = [...qSet].filter((t) => cSet.has(t)).length
    const similarity = shared / (qSet.size + cSet.size - shared)
    if (similarity >= THRESHOLDS.retenderNameSimilarity) {
      matches.push({ candidate: c, kind: 'similar_name', similarity, why: `${Math.round(similarity * 100)}% of the words are shared (needs ${Math.round(THRESHOLDS.retenderNameSimilarity * 100)}%).` })
    }
  }
  matches.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.similarity ?? 0) - (a.similarity ?? 0))

  const strong = matches.filter((m) => m.kind !== 'numbered_variant')
  if (strong.length > 0) {
    const counts = new Map<TenderStatus, number>()
    for (const m of strong) counts.set(m.candidate.status, (counts.get(m.candidate.status) ?? 0) + 1)
    const summary = [...counts].map(([s, n]) => `${n} ${STATUS_WORD[s]}`).join(', ')
    const cancelled = strong.some((m) => m.candidate.status === 'cancelled' || m.candidate.status === 're_tendered')
    return { query, compared: pool.length, matches, verdict: { tone: 'attention', text: `${strong.length} earlier tender${strong.length === 1 ? '' : 's'} on record ${strong.length === 1 ? 'looks' : 'look'} like this one (${summary}). ${cancelled ? 'Read why it was cancelled before issuing it again.' : 'Check that this is not a duplicate.'}` } }
  }
  if (matches.length > 0) {
    return { query, compared: pool.length, matches, verdict: { tone: 'info', text: `Same name as ${matches.length} earlier tender${matches.length === 1 ? '' : 's'} with a different number. Probably a separate package; check what happened to the earlier ones.` } }
  }
  return { query, compared: pool.length, matches: [], verdict: { tone: 'ok', text: `No match among the ${pool.length} tenders on record. This only covers the records in this demo.` } }
}
