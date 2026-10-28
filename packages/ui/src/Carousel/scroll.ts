// Pure helpers for the carousel. No React, no DOM.

/** Index of the slide whose left edge is nearest the scroll position. */
export function activeSlide(scrollLeft: number, slideWidth: number, gap: number, count: number): number {
  if (count <= 0 || slideWidth <= 0) return 0
  const i = Math.round(scrollLeft / (slideWidth + gap))
  return Math.min(Math.max(i, 0), count - 1)
}

/** Which way the track can still scroll, with a few pixels of tolerance for rounding. */
export function scrollState(scrollLeft: number, clientWidth: number, scrollWidth: number, tolerance = 4) {
  return { canPrev: scrollLeft > tolerance, canNext: scrollLeft + clientWidth < scrollWidth - tolerance }
}
