// Keeps the conversation for the life of the browser tab (sessionStorage): a reload, or a trip to the home page and back, brings it back.
// Closing the tab clears it. Nothing is sent anywhere; the messages stay in this browser tab.

const KEY = 'procureintel.chat.v1'
/** A cap so a very long conversation can never fill the storage: past it, the oldest messages are dropped from the saved copy. */
const MAX_CHARS = 1_500_000

export type SavedMessage = { id: string; role: string; [k: string]: unknown }

const isMessage = (m: unknown): m is SavedMessage =>
  typeof m === 'object' && m !== null && typeof (m as SavedMessage).id === 'string' && typeof (m as SavedMessage).role === 'string'

export function loadChat(): SavedMessage[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isMessage) : []
  } catch { return [] }
}

export function saveChat(messages: readonly unknown[]): void {
  try {
    let kept = messages.filter(isMessage)
    let text = JSON.stringify(kept)
    while (text.length > MAX_CHARS && kept.length > 1) { kept = kept.slice(1); text = JSON.stringify(kept) }
    // A cut must not start in the middle of a turn (a tool answer without its call): start again at the next user message.
    if (kept.length !== messages.length) { const i = kept.findIndex((m) => m.role === 'user'); kept = i < 0 ? [] : kept.slice(i); text = JSON.stringify(kept) }
    sessionStorage.setItem(KEY, text)
  } catch { /* storage blocked or full: the chat just will not survive a reload */ }
}

export function clearChat(): void { try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ } }
