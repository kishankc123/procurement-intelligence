import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../Button'
import { Select } from '../Select'
import { TableScroll } from '../TableScroll'
import { ArrowLeft, ChevronRight } from '../icons'
import { pageWindow, paginate, type Page } from './paginate'
import styles from './Pagination.module.css'

const SIZES = [10, 25, 50]
const cls = (name: string) => styles[name] ?? ''

export interface PagedList<T> extends Page<T> {
  pageSize: number
  setPage: (page: number) => void
  setPageSize: (size: number) => void
}

/** State for one paged list. The page resets to 1 when the page size changes and is clamped when the list shrinks. */
export function usePagination<T>(all: T[], initialSize = 10): PagedList<T> {
  const [page, setPage] = useState(1)
  const [pageSize, setSize] = useState(initialSize)
  const current = paginate(all, page, pageSize)
  const setPageSize = useCallback((n: number) => { setSize(n); setPage(1) }, [])
  return { ...current, pageSize, setPage, setPageSize }
}

/**
 * Pagination bar for a table: "Showing 11 to 20 of 34", previous and next, page numbers and rows per page.
 * Hidden when everything fits on the smallest page size. Announces the range to screen readers.
 */
export function Pagination<T>({ list, label = 'rows' }: { list: PagedList<T>; label?: string }) {
  if (list.total <= Math.min(...SIZES)) return null
  const { page, pageCount } = list
  return (
    <nav className={cls('bar')} aria-label={`Pagination for ${label}`}>
      <p className={cls('range')} role="status" aria-live="polite">
        Showing <strong>{list.from}</strong> to <strong>{list.to}</strong> of <strong>{list.total}</strong> {label}
      </p>
      <div className={cls('pages')}>
        <Button onClick={() => list.setPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ArrowLeft size={16} aria-hidden="true" />Previous</Button>
        {pageWindow(pageCount, page).map((p, i) => p === 'gap'
          ? <span key={`gap${i}`} className={cls('gap')} aria-hidden="true">…</span>
          : <Button key={p} variant={p === page ? 'primary' : 'secondary'} onClick={() => list.setPage(p)} aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}>{p}</Button>)}
        <Button onClick={() => list.setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">Next<ChevronRight size={16} aria-hidden="true" /></Button>
      </div>
      <label className={cls('size')}>Rows per page
        <Select aria-label="Rows per page" className="w-20" value={String(list.pageSize)} onValueChange={(v) => list.setPageSize(Number(v))} options={SIZES.map((n) => ({ value: String(n), label: String(n) }))} />
      </label>
    </nav>
  )
}

/**
 * A scrolling table with pagination, in one piece: pass the rows and a function that draws the `<table>` for one page.
 * It owns the page state, so it can sit anywhere in a screen, including below early returns. `resetKey` sends it back to
 * page 1 when it changes, for example when a search box changes.
 */
export function Paged<T>({ items, label, initialSize = 10, resetKey, maxHeight, children }: {
  items: T[]
  label?: string
  initialSize?: number
  resetKey?: unknown
  maxHeight?: string
  children: (pageItems: T[]) => ReactNode
}) {
  const list = usePagination(items, initialSize)
  const { setPage } = list
  useEffect(() => { setPage(1) }, [resetKey, setPage])
  return (
    <>
      <TableScroll maxHeight={maxHeight}>{children(list.items)}</TableScroll>
      <Pagination list={list} label={label} />
    </>
  )
}
