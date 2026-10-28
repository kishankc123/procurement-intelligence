import { Badge as ShadcnBadge } from '../components/ui/badge'

type Tone = 'high' | 'medium' | 'low' | 'neutral'

/** Severity and neutral badge, on the shadcn Badge. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <ShadcnBadge variant={tone}>{children}</ShadcnBadge>
}
