import { Children, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight } from '../icons'
import { Button } from '../Button'
import { activeSlide, scrollState } from './scroll'
import styles from './Carousel.module.css'

const cls = (name: string) => styles[name] ?? ''
const GAP = 16

/**
 * A row of cards you slide through: scroll, swipe, the arrows, the dots or the left and right keys.
 * Built on CSS scroll snapping, so touch and trackpads work natively. When every card fits, the controls are hidden.
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
      <div ref={track} className={cls('track')} role="region" aria-roledescription="carousel" aria-label={ariaLabel} tabIndex={0} onScroll={measure} onKeyDown={onKey}>
        {slides.map((s, i) => (
          <div key={i} className={cls('slide')} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>{s}</div>
        ))}
      </div>
      {overflow && (
        <div className={cls('controls')}>
          <Button onClick={() => go(-1)} disabled={!state.canPrev} aria-label="Previous cards"><ArrowLeft size={16} aria-hidden="true" /></Button>
          <div className={cls('dots')}>
            {slides.map((_, i) => (
              <button key={i} type="button" className={`${cls('dot')} ${i === state.active ? cls('dotOn') : ''}`} aria-label={`Go to card ${i + 1}`} aria-current={i === state.active ? 'true' : undefined} onClick={() => goTo(i)} />
            ))}
          </div>
          <Button onClick={() => go(1)} disabled={!state.canNext} aria-label="Next cards"><ChevronRight size={16} aria-hidden="true" /></Button>
        </div>
      )}
    </div>
  )
}
