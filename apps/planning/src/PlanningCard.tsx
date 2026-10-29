import { useState } from 'react'
import { useDeletePlan, useMeta, usePlan, useProject } from '@pi/data'
import { Card, ConfirmDeleteDialog, EmptyState, ProvenanceChip } from '@pi/ui'
import { PlanAgenda } from './PlanAgenda'
import { EditPlanDialog, PlanList } from './Planning'
import styles from './Planning.module.css'

/**
 * The Planning stage as a card for the chat: a one-line summary of the plans, the plan timeline and the plans table.
 * Same data and same editing as the Planning page (edit and delete are role-gated there too), without the page chrome.
 */
export default function PlanningCard({ projectId }: { projectId: string }) {
  const project = useProject(projectId).data?.[0]
  const plans = usePlan(projectId).data
  const asOf = useMeta().data?.as_of_date
  const remove = useDeletePlan()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (!project || !plans) return <Card state="loading">{null}</Card>
  if (plans.length === 0) {
    return <Card title="Plans" aside={<ProvenanceChip kind="missing" />}><EmptyState title="No plans for this project yet" text="Plans are entered by a planner. Nothing is estimated in the meantime." /></Card>
  }
  const editing = plans.find((p) => p.id === editingId)
  const deleting = plans.find((p) => p.id === deletingId)
  const first = plans.reduce((a, p) => (p.planned_advertisement < a ? p.planned_advertisement : a), plans[0]?.planned_advertisement ?? '')
  const last = plans.reduce((a, p) => (p.planned_signing > a ? p.planned_signing : a), plans[0]?.planned_signing ?? '')

  return (
    <div className={styles.chatCard}>
      <p className={styles.chatSummary}>
        <strong>{plans.length} procurement {plans.length === 1 ? 'plan' : 'plans'}</strong> for {project.project_name}, from the first advertisement on <span className="mono">{first}</span> to the last signing on <span className="mono">{last}</span>.{' '}
        <ProvenanceChip kind="entered" />
      </p>
      {asOf && <PlanAgenda compact plans={plans} asOf={asOf} />}
      <PlanList compact plans={plans} selectedId={selectedId} onSelect={setSelectedId} onEdit={setEditingId} onDelete={setDeletingId} />
      {deleting && (
        <ConfirmDeleteDialog open onOpenChange={(o) => { if (!o) setDeletingId(null) }} what="plan" detail={`${deleting.name} (${deleting.id})`} pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting, { onSuccess: () => { setDeletingId(null); setSelectedId(null) } })} />
      )}
      {editing && <EditPlanDialog plan={editing} open onOpenChange={(o) => { if (!o) setEditingId(null) }} onDeleted={() => { setEditingId(null); setSelectedId(null) }} />}
    </div>
  )
}
