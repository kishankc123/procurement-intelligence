import { useLocation } from 'react-router'
import { EmptyState } from '@pi/ui'

/** Placeholder for screens that are specified but not built yet. */
export function Planned() {
  const { pathname } = useLocation()
  return <EmptyState title="Planned" text={`The screen at ${pathname} is in the design but not built yet. Layout reference: the screenshots folder.`} />
}
