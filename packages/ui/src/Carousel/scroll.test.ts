import { describe, expect, it } from 'vitest'
import { activeSlide, scrollState } from './scroll'

describe('activeSlide', () => {
  it('picks the slide nearest the left edge', () => {
    expect(activeSlide(0, 280, 16, 4)).toBe(0)
    expect(activeSlide(300, 280, 16, 4)).toBe(1)
    expect(activeSlide(150, 280, 16, 4)).toBe(1) // past halfway to the second slide
    expect(activeSlide(140, 280, 16, 4)).toBe(0)
  })
  it('stays within the slides that exist', () => {
    expect(activeSlide(5000, 280, 16, 4)).toBe(3)
    expect(activeSlide(-50, 280, 16, 4)).toBe(0)
    expect(activeSlide(100, 0, 16, 4)).toBe(0)
    expect(activeSlide(100, 280, 16, 0)).toBe(0)
  })
})

describe('scrollState', () => {
  it('knows when everything fits', () => {
    expect(scrollState(0, 1000, 1000)).toEqual({ canPrev: false, canNext: false })
  })
  it('knows where it can still scroll', () => {
    expect(scrollState(0, 600, 1200)).toEqual({ canPrev: false, canNext: true })
    expect(scrollState(300, 600, 1200)).toEqual({ canPrev: true, canNext: true })
    expect(scrollState(600, 600, 1200)).toEqual({ canPrev: true, canNext: false })
    expect(scrollState(2, 600, 1201)).toEqual({ canPrev: false, canNext: true })
  })
})
