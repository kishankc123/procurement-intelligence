// Pure parsing helpers for the ingestion script: no network, no files. Tested in parse.test.ts.

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

/** "13-Dec-2016" or "13-DEC-2016" to "2016-12-13". Returns null for anything else, so a bad date is never invented. */
export function dmyToIso(value: string | null | undefined): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((value ?? '').trim())
  const month = m ? MONTHS[m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1).toLowerCase()] : undefined
  return m && month ? `${m[3]}-${month}-${m[1]!.padStart(2, '0')}` : null
}

/** "12/31/2025 12:00:00 AM" (the Projects API) or an ISO timestamp to "2025-12-31". */
export function apiDateToIso(value: string | null | undefined): string | null {
  const s = (value ?? '').trim()
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return iso ? iso[1]! : null
}

export const RATING_CODE: Record<string, 'HS' | 'S' | 'MS' | 'MU' | 'U' | 'HU'> = {
  'Highly Satisfactory': 'HS', Satisfactory: 'S', 'Moderately Satisfactory': 'MS', 'Moderately Unsatisfactory': 'MU', Unsatisfactory: 'U', 'Highly Unsatisfactory': 'HU',
}
const RATING = '(Highly Satisfactory|Moderately Satisfactory|Moderately Unsatisfactory|Highly Unsatisfactory|Unsatisfactory|Satisfactory|--)'
const RISK = '(Low|Moderate|Substantial|High|--)'
const DATE = '(\\d{1,2}-[A-Za-z]{3}-\\d{4})'

export interface IsrParse {
  sequence: number | null
  progress: { previous: string | null; current: string | null }
  implementation: { previous: string | null; current: string | null }
  risk: { previous: string | null; current: string | null }
  fiduciary: string | null
  disbursedPct: number | null
  restructurings: { date: string; note: string }[]
  keyDates: { approval: string | null; effectiveness: string | null; originalClosing: string | null; revisedClosing: string | null } | null
  /** What could not be read, in words, so the manifest can say which reports need a second look. */
  problems: string[]
}

const clean = (v: string | undefined) => (v === undefined || v === '--' ? null : v)
// The reports use private-use symbol characters as bullets (for example U+F06C) between table cells; they are spaces to the parser.
const collapse = (text: string) => text.replace(/[\uE000-\uF8FF]/g, ' ').replace(/\s+/g, ' ')

/**
 * Reads one Implementation Status and Results Report (the text version) without a model. The layout changed over the years, so every
 * field is optional: a field that cannot be found stays null and is listed in `problems`.
 */
export function parseIsr(raw: string): IsrParse {
  const t = collapse(raw)
  const problems: string[] = []
  const pair = (re: RegExp, label: string) => {
    const m = re.exec(t)
    if (!m) { problems.push(`${label} not found`); return { previous: null, current: null } }
    return { previous: clean(m[1]), current: clean(m[2]) }
  }
  const seq = /Seq No:\s*(\d+)/i.exec(t)
  if (!seq) problems.push('sequence number not found')

  const progress = pair(new RegExp(`Progress towards achievement of (?:the )?PDO\\s+${RATING}\\s+${RATING}`, 'i'), 'PDO rating')
  const implementation = pair(new RegExp(`Overall Implementation Progress \\(IP\\)\\s+${RATING}\\s+${RATING}`, 'i'), 'implementation rating')
  const risk = pair(new RegExp(`Overall Risk Rating\\s+${RISK}\\s+${RISK}`, 'i'), 'overall risk')
  // The newer risk tool lists approval, last and current ratings; the current one is the last.
  const fid = new RegExp(`Fiduciary\\s+${RISK}\\s+${RISK}\\s+${RISK}`).exec(t)

  // Disbursement: every loan row between the financial header and the key dates. Each row's own "% Disbursed", weighted by its revised amount.
  let disbursedPct: number | null = null
  const fin = /Loan\/Credit\/TF\s+Status[^]*?(?=Key Dates|\d+\.\s+KEY DATES|$)/i.exec(t)?.[0] ?? ''
  const rows = [...fin.matchAll(/[A-Z]{2,4}-?[A-Z0-9]*\d{3,}\s+[A-Za-z ]{3,20}?\s+(?:[A-Z]{3}\s+)?(\d[\d,]*\.?\d*)\s+(\d[\d,]*\.?\d*)\s+(\d[\d,]*\.?\d*)\s+(\d[\d,]*\.?\d*)\s+(\d[\d,]*\.?\d*)(?:\s+(\d+(?:\.\d+)?)%)?/g)]
  if (rows.length > 0) {
    let weighted = 0, base = 0
    for (const r of rows) {
      const revised = Number(r[2]!.replace(/,/g, '')), disbursed = Number(r[4]!.replace(/,/g, ''))
      const pct = r[6] !== undefined ? Number(r[6]) : revised > 0 ? Math.min(100, (disbursed / revised) * 100) : 0
      weighted += pct * revised; base += revised
    }
    disbursedPct = base > 0 ? Math.round((weighted / base) * 10) / 10 : null
  }
  if (disbursedPct === null) problems.push('disbursement not found')

  // Restructuring history.
  const restructurings: { date: string; note: string }[] = []
  const hist = /RESTRUCTURING HISTORY\s+(.*?)(?:\d+\.\s+ASSOCIATED|$)/i.exec(t)?.[1] ?? ''
  for (const m of hist.matchAll(new RegExp(`Restructuring Level (\\d)\\s+Approved on\\s+${DATE}`, 'gi'))) {
    const date = dmyToIso(m[2])
    if (date) restructurings.push({ date, note: `Level ${m[1]} restructuring approved` })
  }

  // Key dates: by loan (newer layout, first loan) or the labelled list (oldest layout).
  let keyDates: IsrParse['keyDates'] = null
  const byLoan = new RegExp(`Rev\\. Closing(?: Date)?\\s+(?:P\\d+\\s+)?[A-Z]{2,4}-?[A-Z0-9]*\\d{3,}\\s+[A-Za-z ]{3,20}?\\s+${DATE}\\s+${DATE}\\s+${DATE}\\s+${DATE}\\s+${DATE}`).exec(t)
  if (byLoan) keyDates = { approval: dmyToIso(byLoan[1]), effectiveness: dmyToIso(byLoan[3]), originalClosing: dmyToIso(byLoan[4]), revisedClosing: dmyToIso(byLoan[5]) }
  else {
    const old = new RegExp(`Bank Approval Date:\\s*${DATE}.*?Effectiveness Date:\\s*${DATE}.*?Original Closing Date:\\s*${DATE}\\s+Revised Closing Date:\\s*${DATE}`, 'i').exec(t)
    if (old) keyDates = { approval: dmyToIso(old[1]), effectiveness: dmyToIso(old[2]), originalClosing: dmyToIso(old[3]), revisedClosing: dmyToIso(old[4]) }
    else problems.push('key dates not found')
  }

  return { sequence: seq ? Number(seq[1]) : null, progress, implementation, risk, fiduciary: fid ? clean(fid[3]) : null, disbursedPct, restructurings, keyDates, problems }
}

export interface Piece { text: string; page: number; section: string }

/**
 * Splits a document's text into chunks of about `size` characters at sentence ends. Where the text has "Page N of M" footers (the
 * supervision reports do) the chunk page is exact; otherwise it is an estimate from the position and `exactPages` is false.
 * The section is the last numbered heading seen ("3. OVERALL RATINGS"), or "Text".
 */
export function chunkText(raw: string, size = 1500): { pieces: Piece[]; exactPages: boolean; pages: number } {
  const t = collapse(raw).trim()
  const footers = [...t.matchAll(/Page (\d+) of (\d+)/g)].map((m) => ({ at: m.index ?? 0, page: Number(m[1]), of: Number(m[2]) }))
  const exactPages = footers.length > 0
  const pages = exactPages ? Math.max(...footers.map((f) => f.of)) : Math.max(1, Math.ceil(t.length / 3500))
  // A footer closes its page, so text before the first footer is page 1.
  const pageAt = (pos: number) => (exactPages ? (footers.find((f) => f.at >= pos)?.page ?? pages) : Math.floor(pos / 3500) + 1)
  const headings = [...t.matchAll(/(?:^|\s)(\d{1,2}\.\s[A-Z][A-Z &,/()'-]{3,60})(?=\s+[A-Z][a-z]|\s+\d)/g)].map((m) => ({ at: m.index ?? 0, name: m[1]!.trim() }))
  const sectionAt = (pos: number) => [...headings].reverse().find((h) => h.at <= pos)?.name ?? 'Text'

  const pieces: Piece[] = []
  let start = 0
  while (start < t.length) {
    let end = Math.min(start + size, t.length)
    if (end < t.length) {
      const stop = t.lastIndexOf('. ', end)
      if (stop > start + size * 0.5) end = stop + 1
    }
    const text = t.slice(start, end).trim()
    if (text) pieces.push({ text, page: pageAt(start), section: sectionAt(start) })
    start = end
  }
  return { pieces, exactPages, pages }
}
