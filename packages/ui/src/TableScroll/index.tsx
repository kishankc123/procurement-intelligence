import type { ReactNode } from 'react'
import styles from './TableScroll.module.css'

/** Wraps a table so it scrolls sideways inside its card on narrow screens instead of widening the page. Focusable so keyboard users can scroll it. */
export function TableScroll({ children, label = 'Table. Scroll sideways to see all columns.' }: { children: ReactNode; label?: string }) {
  return <div className={styles.scroll} role="region" tabIndex={0} aria-label={label}>{children}</div>
}
