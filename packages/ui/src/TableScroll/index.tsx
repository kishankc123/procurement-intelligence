import type { ReactNode } from 'react'
import styles from './TableScroll.module.css'

/**
 * Wraps a table so it scrolls sideways inside its card on narrow screens instead of widening the page.
 * With `maxHeight` it also scrolls up and down, and the header row stays in view. Focusable so keyboard users can scroll it.
 */
export function TableScroll({ children, label, maxHeight }: { children: ReactNode; label?: string; maxHeight?: string }) {
  const name = label ?? (maxHeight ? 'Table. Scroll to see all rows and columns.' : 'Table. Scroll sideways to see all columns.')
  return <div className={`${styles.scroll} ${maxHeight ? styles.vertical : ''}`} style={maxHeight ? { maxHeight } : undefined} role="region" tabIndex={0} aria-label={name}>{children}</div>
}
