import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot, Button, SendHorizontal, User } from '@pi/ui'
import styles from './ChatWindow.module.css'

export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  /** Anything shown under the text: a run log, a card, choices. */
  extra?: ReactNode
}

/**
 * A chat window: a scrolling message list, suggested prompts and an input. Presentational only: it knows nothing about
 * where replies come from, so a different assistant (or CopilotKit) can drive it later.
 */
export function ChatWindow({ messages, onSend, pending, suggestions, placeholder = 'Message the assistant', size = 'full', onEngage }: {
  messages: ChatMessageView[]
  onSend: (text: string) => void
  pending: boolean
  suggestions: string[]
  placeholder?: string
  /** `compact` is a small starter window (a greeting and the input); `full` fills most of the screen. */
  size?: 'compact' | 'full'
  /** Called when the input gets focus, so a page can make room for the chat. Not called for suggestion buttons, which would move under the pointer. */
  onEngage?: () => void
}) {
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement>(null)
  // Keep the latest exchange in view from its start: the log is anchored at your last message, so the assistant's answer
  // (its run, text and cards) is read from its first line instead of being scrolled past to its end.
  const root = useRef<HTMLDivElement>(null)
  const sent = useRef(0)
  const lastUser = messages.reduce((n, m, i) => (m.role === 'user' ? i : n), -1)
  useEffect(() => {
    const el = log.current
    if (!el) return
    const row = el.querySelector<HTMLElement>('[data-anchor="true"]')
    el.scrollTop = row ? Math.max(row.offsetTop - 4, 0) : 0
  }, [messages.length, pending]) // eslint-disable-line react-hooks/exhaustive-deps -- only when a message is added, so reading and scrolling are not undone
  // A new message of yours also brings the chat window itself to the top of the page, so the exchange is on screen.
  useEffect(() => {
    if (lastUser < 0 || lastUser === sent.current) return
    sent.current = lastUser
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [lastUser])

  const submit = (text: string) => { const t = text.trim(); if (!t || pending) return; onSend(t); setDraft('') }

  return (
    <div ref={root} className={`${styles.window} ${size === 'compact' ? styles.compact : ''}`}>
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-label="Conversation" tabIndex={0}>
        {messages.map((m, i) => (
          <div key={m.id} data-anchor={i === lastUser} className={`${styles.row} ${m.role === 'user' ? styles.user : ''}`}>
            <span className={`${styles.avatar} ${m.role === 'user' ? styles.avatarUser : ''}`} aria-hidden="true">
              {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </span>
            <div className={`${styles.bubble} ${m.role === 'error' ? styles.error : ''}`}>
              <span className={styles.who}>{m.role === 'user' ? 'You' : m.role === 'error' ? 'Problem' : 'Assistant'}</span>
              {m.text && <p>{m.text}</p>}
              {m.extra}
            </div>
          </div>
        ))}
        {pending && (
          <div className={styles.row}>
            <span className={styles.avatar} aria-hidden="true"><Bot size={16} /></span>
            <div className={styles.bubble} role="status"><span className={styles.who}>Assistant</span><p className={styles.typing}>Working on it<span aria-hidden="true">…</span></p></div>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className={styles.suggestions} aria-label="Suggested prompts">
          {suggestions.map((s) => <button key={s} type="button" className={styles.chip} disabled={pending} onClick={() => submit(s)}>{s}</button>)}
        </div>
      )}
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); submit(draft) }}>
        <input aria-label="Message" onFocus={onEngage} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} maxLength={2000} autoComplete="off" />
        <Button type="submit" variant="primary" disabled={pending || !draft.trim()}><SendHorizontal size={16} aria-hidden="true" />Send</Button>
      </form>
    </div>
  )
}
