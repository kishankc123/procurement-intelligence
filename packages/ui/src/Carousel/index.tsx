import { Children, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { activeSlide, scrollState } from './scroll'
import styles from './Carousel.module.css'

const cls = (name: string) => styles[name] ?? ''
const GAP = 16

/** A tall, thin arrowhead; drawn here (not an icon) so its width fits the page margin beside the row. */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  const points = dir === 'left' ? '13,2 2,28 13,54' : '2,2 13,28 2,54'
  return <svg width="15" height="56" viewBox="0 0 15 56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points={points} /></svg>
}

/**
 * A row of cards you slide through: scroll, swipe, the arrows, the dots or the left and right keys.
 * Built on CSS scroll snapping, so touch and trackpads work natively. The arrows sit in the page margin beside the row, so the cards keep the full width of the content below and are always shown; they are disabled when every card fits.
 */
export function Carousel({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  const slides = Children.toArray(children)
  const track = useRef<HTMLDivElement>(null)
  const [state, setState] = useState({ canPrev: false, canNext: false, active: 0 })

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const { canPrev, canNext } = scrollState(el.scrollLeft, el.clientWidth, el.scrollWidth)
    const active = activeSlide(el.scrollLeft, first?.offsetWidth ?? 0, GAP, slides.length)
    setState((s) => (s.canPrev === canPrev && s.canNext === canNext && s.active === active ? s : { canPrev, canNext, active }))
  }, [slides.length])

  useEffect(() => {
    measure()
    const el = track.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const behavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
  const slideWidth = () => (track.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 280
  const go = (dir: -1 | 1) => track.current?.scrollBy({ left: dir * (slideWidth() + GAP), behavior: behavior() })
  const goTo = (i: number) => track.current?.scrollTo({ left: i * (slideWidth() + GAP), behavior: behavior() })
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
  }
  const overflow = state.canPrev || state.canNext

  return (
    <div className={cls('root')}>
      <div className={cls('stage')}>
      {overflow && <button type="button" className={`${cls('arrow')} ${cls('arrowPrev')}`} onClick={() => go(-1)} disabled={!state.canPrev} aria-label="Previous cards"><Chevron dir="left" /></button>}
      <div ref={track} className={cls('track')} role="region" aria-roledescription="carousel" aria-label={ariaLabel} tabIndex={0} onScroll={measure} onKeyDown={onKey}>
        {slides.map((s, i) => (
          <div key={i} className={cls('slide')} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>{s}</div>
        ))}
      </div>
      {overflow && <button type="button" className={`${cls('arrow')} ${cls('arrowNext')}`} onClick={() => go(1)} disabled={!state.canNext} aria-label="Next cards"><Chevron dir="right" /></button>}
      </div>
      {overflow && (
        <div className={cls('dots')}>
          {slides.map((_, i) => (
            <button key={i} type="button" className={`${cls('dot')} ${i === state.active ? cls('dotOn') : ''}`} aria-label={`Go to card ${i + 1}`} aria-current={i === state.active ? 'true' : undefined} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
    </div>
  )
}
