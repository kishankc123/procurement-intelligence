import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CircleAlert, CircleHelp, Info } from 'lucide-react'
import styles from './InfoTip.module.css'

export type InfoTone = 'good' | 'attention' | 'bad' | 'neutral'

const cls = (name: string) => styles[name] ?? ''
const ICON = { good: Info, attention: CircleAlert, bad: CircleAlert, neutral: CircleHelp } as const

/**
 * A small icon that explains a result: "i" for fine, "!" for something to look at, "?" for unknown.
 * The text opens on hover, keyboard focus or click, so it can hold links, and closes with Escape. Presentational only.
 */
export function InfoTip({ tone, label, children }: { tone: InfoTone; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const Icon = ICON[tone]
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
  return (
    <span className={cls('wrap')} onMouseLeave={() => setOpen(false)} onKeyDown={onKey}>
      <button type="button" className={`${cls('btn')} ${cls(tone)}`} aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Icon size={16} aria-hidden="true" />
      </button>
      <span id={id} role="group" aria-label={label} className={`${cls('pop')} ${open ? cls('popOpen') : ''}`}>{children}</span>
    </span>
  )
}
