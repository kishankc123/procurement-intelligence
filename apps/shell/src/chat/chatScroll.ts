// Keeps the chat showing its newest message. CopilotKit's chat follows new content on its own, but it stops following once the reader has scrolled up (to
// click a donut in an earlier card, say), so a message added by that click appears below the screen. `scrollChatToLatest` scrolls the message list to its
// end; a scroll downwards also makes CopilotKit follow the answer again as it arrives (its "stick to bottom" lock is released by scrolling down).

/** Marks the chat panel, so the scroller can be found from anywhere (a card's click handler has no reference to the panel). */
export const CHAT_PANEL_ATTR = 'data-chat-panel'

/** The element that scrolls the messages: the tallest element in the panel that can scroll. Tables inside cards can scroll too, but they are shorter. */
export function findChatScroller(panel: ParentNode): HTMLElement | null {
  let best: HTMLElement | null = null
  for (const el of panel.querySelectorAll<HTMLElement>('*')) {
    if (el.scrollHeight <= el.clientHeight + 1) continue
    const overflow = getComputedStyle(el).overflowY
    if (overflow !== 'auto' && overflow !== 'scroll') continue
    if (!best || el.clientHeight > best.clientHeight) best = el
  }
  return best
}

/**
 * Scrolls the chat to its newest message now, and again a moment later while the new message and its card lay themselves out (they grow after the first
 * render). A reader who starts scrolling in the meantime is left alone. Returns a function that cancels the follow-up scrolls.
 */
export function scrollChatToLatest(root: ParentNode = document, delays: number[] = [0, 150, 450, 1000]): () => void {
  const panel = root.querySelector(`[${CHAT_PANEL_ATTR}]`)
  if (!panel) return () => undefined
  let cancelled = false
  const timers: ReturnType<typeof setTimeout>[] = []
  const stop = () => { cancelled = true; timers.forEach(clearTimeout) }
  const go = () => {
    if (cancelled) return
    const scroller = findChatScroller(panel)
    if (!scroller) return
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
    else scroller.scrollTop = scroller.scrollHeight
  }
  const first = findChatScroller(panel)
  first?.addEventListener('wheel', stop, { once: true, passive: true })
  first?.addEventListener('touchstart', stop, { once: true, passive: true })
  for (const d of delays) timers.push(setTimeout(go, d))
  timers.push(setTimeout(() => { first?.removeEventListener('wheel', stop); first?.removeEventListener('touchstart', stop) }, Math.max(...delays) + 50))
  return stop
}
