import { useRef, type ReactNode } from 'react'
import { Card as ShadcnCard, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { SkeletonText } from '../Skeleton'
import { DownloadPng } from '../DownloadPng'

interface Props { title?: string; aside?: ReactNode; children: ReactNode; state?: 'loading' | 'error' | 'ready'
  /** Adds a Download PNG button that saves the whole card as a picture, with this as the file name. */
  downloadName?: string }

/** Card with built-in loading and error states so every data card has them. Built on the shadcn Card. */
export function Card({ title, aside, children, state = 'ready', downloadName }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const download = downloadName && state === 'ready' ? <DownloadPng targetRef={ref} name={downloadName} /> : null
  return (
    // overflow-visible: tooltips (the Monitoring chart) may extend past the card edge.
    <ShadcnCard ref={ref} className="gap-3 overflow-visible py-3 ring-border [--card-spacing:--spacing(3)] sm:py-4 sm:[--card-spacing:--spacing(5)]">
      {(title || aside || download) && (
        <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <CardTitle className="font-semibold">{title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">{aside}{download}</div>
        </CardHeader>
      )}
      <CardContent className="min-w-0">
        {state === 'loading' && <SkeletonText lines={3} />}
        {state === 'error' && <p className="text-muted-foreground" role="alert">Could not load this data. Is the API running on port 3001?</p>}
        {state === 'ready' && children}
      </CardContent>
    </ShadcnCard>
  )
}
