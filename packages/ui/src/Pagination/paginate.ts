// Pure helpers for paging a list. No React.

export interface Page<T> {
  items: T[]
  /** The page actually shown (1-based), clamped to the pages that exist. */
  page: number
  pageCount: number
  /** 1-based position of the first and last row on this page; 0 when the list is empty. */
  from: number
  to: number
  total: number
}

export function paginate<T>(all: T[], requestedPage: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize))
  const pageCount = Math.max(1, Math.ceil(all.length / size))
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount)
  const start = (page - 1) * size
  const items = all.slice(start, start + size)
  return { items, page, pageCount, from: items.length ? start + 1 : 0, to: start + items.length, total: all.length }
}

/** Page buttons to show: the first and last page and the current one with its neighbours, with 'gap' where pages are skipped. */
export function pageWindow(pageCount: number, current: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, current - 1, current, current + 1].filter((n) => n >= 1 && n <= pageCount))
  const sorted = [...wanted].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1]
    if (prev !== undefined && n - prev > 1) out.push(n - prev === 2 ? prev + 1 : 'gap')
    out.push(n)
  })
  return out
}
