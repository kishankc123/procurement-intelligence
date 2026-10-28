import type { ReactNode } from 'react'
import { Card as ShadcnCard, CardContent, CardHeader, CardTitle } from '../components/ui/card'

interface Props { title?: string; aside?: ReactNode; children: ReactNode; state?: 'loading' | 'error' | 'ready' }

/** Card with built-in loading and error states so every data card has them. Built on the shadcn Card. */
export function Card({ title, aside, children, state = 'ready' }: Props) {
  return (
    // overflow-visible: tooltips (the Monitoring chart) may extend past the card edge.
    <ShadcnCard className="gap-3 overflow-visible py-4 ring-border [--card-spacing:--spacing(5)]">
      {(title || aside) && (
        <CardHeader className="flex items-baseline justify-between gap-3">
          <CardTitle className="font-semibold">{title}</CardTitle>
          <div>{aside}</div>
        </CardHeader>
      )}
      <CardContent className="min-w-0">
        {state === 'loading' && <p className="text-muted-foreground" role="status">Loading…</p>}
        {state === 'error' && <p className="text-muted-foreground" role="alert">Could not load this data. Is the API running on port 3001?</p>}
        {state === 'ready' && children}
      </CardContent>
    </ShadcnCard>
  )
}
