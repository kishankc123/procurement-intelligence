import { describe, expect, it } from 'vitest'
import { pageWindow, paginate } from './paginate'

const list = Array.from({ length: 23 }, (_, i) => i + 1)

describe('paginate', () => {
  it('slices a page and says which rows it shows', () => {
    const p = paginate(list, 2, 10)
    expect(p.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(p).toMatchObject({ page: 2, pageCount: 3, from: 11, to: 20, total: 23 })
  })
  it('shows a short last page', () => {
    expect(paginate(list, 3, 10)).toMatchObject({ items: [21, 22, 23], from: 21, to: 23 })
  })
  it('clamps a page that no longer exists, for example after filtering', () => {
    expect(paginate(list.slice(0, 5), 4, 10)).toMatchObject({ page: 1, pageCount: 1, from: 1, to: 5 })
    expect(paginate(list, 0, 10).page).toBe(1)
  })
  it('handles an empty list and a bad page size', () => {
    expect(paginate([], 1, 10)).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 })
    expect(paginate(list, 1, 0).items).toHaveLength(1)
  })
})

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(3, 1)).toEqual([1, 2, 3])
  })
  it('keeps the first, last and nearby pages with gaps between', () => {
    expect(pageWindow(20, 10)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
    expect(pageWindow(20, 1)).toEqual([1, 2, 'gap', 20])
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 19, 20])
  })
  it('fills a one-page hole instead of a gap', () => {
    expect(pageWindow(5, 3)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(7, 4)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(pageWindow(9, 5)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9])
  })
})
