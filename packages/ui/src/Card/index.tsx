import type { ReactNode } from 'react'
import styles from './Card.module.css'

interface Props { title?: string; aside?: ReactNode; children: ReactNode; state?: 'loading' | 'error' | 'ready' }

/** Card with built-in loading and error states so every data card has them. */
export function Card({ title, aside, children, state = 'ready' }: Props) {
  return (
    <section className={styles.card}>
      {(title || aside) && (
        <header className={styles.head}><h2>{title}</h2><div>{aside}</div></header>
      )}
      {state === 'loading' && <p className={styles.note} role="status">Loading…</p>}
      {state === 'error' && <p className={styles.note} role="alert">Could not load this data. Is the API running on port 3001?</p>}
      {state === 'ready' && children}
    </section>
  )
}
