import type { ComponentProps } from 'react'
import { Button as ShadcnButton } from '../components/ui/button'

interface Props extends Omit<ComponentProps<'button'>, 'color'> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger'
  /** Shown as the tooltip and read aloud when the button is disabled by a permission. */
  disabledReason?: string
}

const VARIANT = { primary: 'default', secondary: 'outline', success: 'success', danger: 'danger' } as const

/** Our button API on top of the shadcn Button, so screens keep their props. */
export function Button({ variant = 'secondary', disabledReason, disabled, title, ...rest }: Props) {
  return <ShadcnButton {...rest} variant={VARIANT[variant]} disabled={disabled || Boolean(disabledReason)} title={disabledReason ?? title} />
}
