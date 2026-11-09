import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_PANEL_ATTR, findChatScroller, scrollChatToLatest } from './chatScroll'

/** jsdom has no layout, so a box's size and its scrolling are set by hand. */
function box(parent: HTMLElement, o: { client: number; scroll: number; overflow?: string }): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientHeight', { value: o.client, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: o.scroll, configurable: true })
  if (o.overflow) el.style.overflowY = o.overflow
  parent.appendChild(el)
  return el
}
let panel: HTMLElement
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; panel = document.createElement('div'); panel.setAttribute(CHAT_PANEL_ATTR, ''); document.body.appendChild(panel) })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

describe('findChatScroller', () => {
  it('picks the tallest element that can scroll, not a shorter table scroller inside a card or a box that fits its content', () => {
    const chat = box(panel, { client: 600, scroll: 2400, overflow: 'auto' })
    box(chat, { client: 300, scroll: 900, overflow: 'auto' })      // a table in a card
    box(panel, { client: 800, scroll: 800, overflow: 'auto' })     // taller but nothing to scroll
    box(panel, { client: 700, scroll: 1500, overflow: 'visible' }) // overflows but is not a scroller
    expect(findChatScroller(panel)).toBe(chat)
  })
  it('returns null when nothing scrolls', () => {
    box(panel, { client: 100, scroll: 100, overflow: 'auto' })
    expect(findChatScroller(panel)).toBeNull()
  })
})

describe('scrollChatToLatest', () => {
  it('scrolls the message list to its end now and again while the new card lays itself out', () => {
    const chat = box(panel, { client: 600, scroll: 2400, overflow: 'auto' })
    const scrollTo = vi.fn(); chat.scrollTo = scrollTo as never
    scrollChatToLatest(document)
    vi.advanceTimersByTime(0); expect(scrollTo).toHaveBeenCalledTimes(1)
    Object.defineProperty(chat, 'scrollHeight', { value: 3100, configurable: true }) // the card grew
    vi.advanceTimersByTime(1100)
    expect(scrollTo).toHaveBeenCalledTimes(4)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 3100, behavior: 'smooth' })
  })
  it('leaves a reader alone who starts scrolling, and can be cancelled', () => {
    const chat = box(panel, { client: 600, scroll: 2400, overflow: 'auto' })
    const scrollTo = vi.fn(); chat.scrollTo = scrollTo as never
    scrollChatToLatest(document)
    vi.advanceTimersByTime(0); expect(scrollTo).toHaveBeenCalledTimes(1)
    chat.dispatchEvent(new Event('wheel'))
    vi.advanceTimersByTime(2000); expect(scrollTo).toHaveBeenCalledTimes(1)
    scrollTo.mockClear()
    const stop = scrollChatToLatest(document); stop()
    vi.advanceTimersByTime(2000); expect(scrollTo).not.toHaveBeenCalled()
  })
  it('does nothing without a chat panel, and falls back to scrollTop where scrollTo is missing', () => {
    document.body.innerHTML = ''
    expect(() => scrollChatToLatest(document)).not.toThrow()
    panel = document.createElement('div'); panel.setAttribute(CHAT_PANEL_ATTR, ''); document.body.appendChild(panel)
    const chat = box(panel, { client: 600, scroll: 2400, overflow: 'auto' })
    ;(chat as { scrollTo?: unknown }).scrollTo = undefined
    scrollChatToLatest(document); vi.advanceTimersByTime(0)
    expect(chat.scrollTop).toBe(2400)
  })
})
