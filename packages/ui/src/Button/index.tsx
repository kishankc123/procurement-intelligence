import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger'
  /** Shown as the tooltip and read aloud when the button is disabled by a permission. */
  disabledReason?: string
}

export function Button({ variant = 'secondary', disabledReason, disabled, className, ...rest }: Props) {
  const off = disabled || Boolean(disabledReason)
  return <button {...rest} disabled={off} title={disabledReason ?? rest.title} className={`${styles.btn} ${styles[variant]} ${className ?? ''}`} />
}
