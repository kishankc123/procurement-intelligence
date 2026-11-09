import { useId, useState } from 'react'
import type { LifecycleEdit } from '@pi/data'
import { Button } from '@pi/ui'
import { ClausesDetail, PlanDetail, RowsDetail, TimelineDetail } from './lifecycleDetail'
import { PLAN_FIELDS, applyClauseChanges, applyEstimateChanges, applyPlanChanges, type PlanField } from './lifecycleEdit'
import styles from './MyLifecycle.module.css'

const DATES: PlanField[] = ['planned_advertisement', 'planned_bid_opening', 'planned_evaluation_complete', 'planned_signing']

/** Save and Cancel under a form, with the reason a save was refused. The same checks as the chat command apply (lifecycleEdit.ts). */
function FormActions({ error, onCancel, disabled }: { error: string | null; onCancel: () => void; disabled?: boolean }) {
  return (
    <>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.row}>
        <Button type="submit" variant="success" disabled={disabled}>Save changes</Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </>
  )
}

/** Edit the plan: name, category, method and the four planned dates. Dates must be real and stay in order. */
export function PlanEditForm({ detail, onSave, onCancel }: { detail: unknown; onSave: (edit: LifecycleEdit) => void; onCancel: () => void }) {
  const parsed = PlanDetail.safeParse(detail)
  const id = useId()
  const [values, setValues] = useState<Record<PlanField, string>>(() => ({ ...(parsed.success ? parsed.data.plan : ({} as Record<PlanField, string>)) }))
  const [error, setError] = useState<string | null>(null)
  if (!parsed.success) return <p role="alert" className={styles.error}>This plan cannot be edited.</p>
  const submit = () => {
    const r = applyPlanChanges(detail, values)
    if (!r.ok) return setError(r.error)
    setError(null)
    onSave(r.edit)
  }
  const field = (f: PlanField, type: 'text' | 'date') => (
    <label key={f} className={styles.field}>{PLAN_FIELDS[f]}
      <input id={`${id}-${f}`} type={type} value={values[f]} required onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
    </label>
  )
  return (
    <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); submit() }} aria-label="Edit plan">
      <div className={styles.fields}>
        {field('name', 'text')}{field('category', 'text')}{field('method', 'text')}
        {DATES.map((f) => field(f, 'date'))}
      </div>
      <FormActions error={error} onCancel={onCancel} />
    </form>
  )
}

/** Edit each tender clause: a number for a numeric clause, text otherwise. */
export function ClausesEditForm({ detail, onSave, onCancel }: { detail: unknown; onSave: (edit: LifecycleEdit) => void; onCancel: () => void }) {
  const parsed = ClausesDetail.safeParse(detail)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((parsed.success ? parsed.data.clauses : []).map((c) => [c.label, String(c.value)])))
  const [error, setError] = useState<string | null>(null)
  if (!parsed.success) return <p role="alert" className={styles.error}>These clauses cannot be edited.</p>
  const submit = () => {
    const changes = parsed.data.clauses.filter((c) => values[c.label] !== String(c.value)).map((c) => ({ clause: c.label, value: values[c.label] ?? '' }))
    const r = applyClauseChanges(detail, changes)
    if (!r.ok) return setError(r.error)
    setError(null)
    onSave(r.edit)
  }
  return (
    <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); submit() }} aria-label="Edit tender clauses">
      <div className={styles.fields}>
        {parsed.data.clauses.map((c) => (
          <label key={c.label} className={styles.field}>{c.label}{c.unit ? ` (${c.unit})` : ''}
            <input type={typeof c.value === 'number' ? 'number' : 'text'} step="any" min={typeof c.value === 'number' ? 0 : undefined} value={values[c.label] ?? ''} required onChange={(e) => setValues({ ...values, [c.label]: e.target.value })} />
          </label>
        ))}
      </div>
      <FormActions error={error} onCancel={onCancel} />
    </form>
  )
}

/**
 * Edit estimates: each figure (a median) and, for the planning estimates, each date. Changing a figure works the dates out again from it and keeps the
 * dates you set by hand; changing a date sets it directly. The same checks as the chat command apply.
 */
export function EstimatesEditForm({ detail, onSave, onCancel }: { detail: unknown; onSave: (edit: LifecycleEdit) => void; onCancel: () => void }) {
  const rows = RowsDetail.safeParse(detail)
  const timeline = TimelineDetail.safeParse((detail as { timeline?: unknown } | null)?.timeline)
  const figures = rows.success ? rows.data.rows.filter((r) => r.value !== null) : []
  const dates = timeline.success ? timeline.data.milestones : []
  const [fig, setFig] = useState<Record<string, string>>(() => Object.fromEntries(figures.map((r) => [r.metric, String(r.value)])))
  const [day, setDay] = useState<Record<string, string>>(() => Object.fromEntries(dates.map((m) => [m.id, m.date])))
  const [error, setError] = useState<string | null>(null)
  if (!rows.success) return <p role="alert" className={styles.error}>These estimates cannot be edited.</p>
  const submit = () => {
    const r = applyEstimateChanges(detail, {
      figures: figures.filter((f) => fig[f.metric] !== String(f.value)).map((f) => ({ metric: f.metric, value: fig[f.metric] ?? '' })),
      dates: dates.filter((m) => day[m.id] !== m.date).map((m) => ({ milestone: m.id, value: day[m.id] ?? '' })),
    })
    if (!r.ok) return setError(r.error)
    setError(null)
    onSave(r.edit)
  }
  return (
    <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); submit() }} aria-label="Edit estimates">
      <h5 className={styles.formHead}>Figures</h5>
      <div className={styles.fields}>
        {figures.map((f) => (
          <label key={f.metric} className={styles.field}>{f.metric}{f.unit ? ` (${f.unit})` : ''}
            <input type={typeof f.value === 'number' ? 'number' : 'text'} step="any" min={typeof f.value === 'number' ? 0 : undefined} value={fig[f.metric] ?? ''} required onChange={(e) => setFig({ ...fig, [f.metric]: e.target.value })} />
          </label>
        ))}
      </div>
      {dates.length > 0 && (
        <>
          <h5 className={styles.formHead}>Dates</h5>
          <p className={styles.hint}>Changing a figure works the dates out again and keeps any date you set here.</p>
          <div className={styles.fields}>
            {dates.map((m) => (
              <label key={m.id} className={styles.field}>{m.label}
                <input type="date" value={day[m.id] ?? ''} required onChange={(e) => setDay({ ...day, [m.id]: e.target.value })} />
              </label>
            ))}
          </div>
        </>
      )}
      <FormActions error={error} onCancel={onCancel} />
    </form>
  )
}
