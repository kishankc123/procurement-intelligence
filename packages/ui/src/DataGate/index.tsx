import type { ReactNode } from 'react'
interface Gate { ok: boolean; n: number; required: number }
import { EmptyState } from '../EmptyState'

interface Props { gate: Gate; title: string; unit?: string; action?: ReactNode; children: ReactNode }

/** Renders children only when the sample size meets the threshold; otherwise shows n, required n and where to add data. */
export function DataGate({ gate, title, unit = 'records', action, children }: Props) {
  if (gate.ok) return <>{children}</>
  return <EmptyState title={title} text={`Needs ${gate.required} ${unit}. ${gate.n} available so far.`} action={action} />
}
