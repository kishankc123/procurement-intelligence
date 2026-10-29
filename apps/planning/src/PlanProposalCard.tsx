import { useMeta, type Plan } from '@pi/data'
import { Card, ProvenanceChip } from '@pi/ui'
import { PlanAgenda } from './PlanAgenda'

export interface PlanProposal {
  plan: Omit<Plan, 'id' | 'project_id'>
  basis: { sample_size: number; projects: string[]; median_total_days: number; filtered_by: string }
  deadline?: { fits: boolean; spare_days?: number; days_over?: number }
}

/**
 * A suggested plan for the user's own procurement, drawn with the same timeline as the Planning stage. The dates were worked out on the server from the
 * stored plans; this card only shows them, and says how many plans and which projects they rest on. It is a suggestion (derived), not a saved plan.
 */
export default function PlanProposalCard({ proposal }: { proposal: PlanProposal }) {
  const asOf = useMeta().data?.as_of_date
  if (!asOf) return <Card state="loading">{null}</Card>
  const plan: Plan = { ...proposal.plan, id: 'SUGGESTED', project_id: '' }
  const { basis, deadline } = proposal
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0 }}>
        <strong>Suggested plan</strong> from {basis.sample_size} stored {basis.sample_size === 1 ? 'plan' : 'plans'} ({basis.filtered_by}), median {basis.median_total_days} days from advertisement to signing.{' '}
        <ProvenanceChip kind="derived" detail={`n=${basis.sample_size}`} />
      </p>
      {deadline && (
        <p role="status" style={{ margin: 0 }}>
          {deadline.fits ? `Fits the signing deadline with ${deadline.spare_days} days to spare.` : `Misses the signing deadline by ${deadline.days_over} days.`}
        </p>
      )}
      <PlanAgenda compact plans={[plan]} asOf={asOf} title="Suggested plan timeline" provenance="derived" />
      <p style={{ margin: 0, color: 'var(--muted)' }}>Reference projects: <span className="mono">{basis.projects.join(', ')}</span>. Durations are reference medians, not a forecast.</p>
    </div>
  )
}
