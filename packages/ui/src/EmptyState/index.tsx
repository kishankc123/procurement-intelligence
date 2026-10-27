import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

interface Props { title: string; text?: string; action?: ReactNode }

/** Missing data is a feature: say what is missing and offer the next step. */
export function EmptyState({ title, text, action }: Props) {
  return (
    <div className={styles.box}>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}
