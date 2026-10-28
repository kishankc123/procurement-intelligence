import { cn } from '../lib/utils'
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

export interface SelectOption { value: string; label: string }

interface Props {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

/** Option-list select on the shadcn Select (Radix): keyboard search, arrow keys, screen-reader roles. Values must not be empty strings. */
export function Select({ value, onValueChange, options, placeholder, disabled, className, ...rest }: Props) {
  return (
    <UiSelect value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={rest['aria-label']} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </UiSelect>
  )
}
