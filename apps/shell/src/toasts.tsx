// Small alerts ("toasts") for things that finish in the background, such as a project that has been ingested. A module-level list that any component
// can add to with `notify`, and `ToastHost` (mounted once in App) draws it. No dependency: useSyncExternalStore reads the list.
import { useEffect, useSyncExternalStore } from 'react'
import { CircleCheck, CircleAlert, X } from '@pi/ui'
import styles from './Toast.module.css'

export interface Toast { id: number; tone: 'success' | 'error'; title: string; text?: string }

let toasts: Toast[] = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Shows an alert. It goes away by itself after a few seconds (longer for an error), or when it is closed. Returns its id. */
export function notify(toast: Omit<Toast, 'id'>): number {
  const id = next++
  toasts = [...toasts, { ...toast, id }].slice(-4)
  emit()
  return id
}
export function dismissToast(id: number): void { toasts = toasts.filter((t) => t.id !== id); emit() }
export const getToasts = (): Toast[] => toasts
/** For tests: forget every alert. */
export function clearToasts(): void { toasts = []; emit() }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function Item({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.tone === 'error' ? 15_000 : 9_000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.tone])
  return (
    <li className={`${styles.toast} ${toast.tone === 'error' ? styles.error : styles.success}`}>
      {toast.tone === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
      <div className={styles.body}><strong>{toast.title}</strong>{toast.text && <span>{toast.text}</span>}</div>
      <button type="button" className={styles.close} onClick={() => dismissToast(toast.id)} aria-label={`Dismiss: ${toast.title}`}><X size={14} aria-hidden="true" /></button>
    </li>
  )
}

/** The alerts, fixed at the bottom right of the screen. A screen reader hears each one when it appears (polite live region). */
export function ToastHost() {
  const list = useSyncExternalStore(subscribe, getToasts, getToasts)
  return <ul className={styles.host} role="status" aria-live="polite" aria-label="Notifications">{list.map((t) => <Item key={t.id} toast={t} />)}</ul>
}
