import { useEffect, useState } from 'react'
import { PAST_PROJECTS_EDITABLE, can, whyDisabled } from '@pi/config'
import {
  SPEC_STATUS_LABEL, countryReference, draftComplete, specificationChecks, suggestTenderDraft, tenderCandidates,
  useAllPlans, useChunks, useContracts, useCountryYears, useCreateTenderDraft, useCurrentUser, useDocs, useEnrichments, usePlan, useProject,
  useSaveTenderDraft, useTenderDraft, useTenderHistory, useUiStore, type DraftField, type TenderDraft,
} from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip, Select } from '@pi/ui'
import { ValidityCoverage } from '../pages/ValidityCoverage'
import { TenderNoticesOnRecord } from './OnRecordCards'
import styles from './TenderDraftCard.module.css'

const METHODS = ['Lowest evaluated price', 'Quality and cost based', 'Fixed budget']
const NUMERIC: { field: Exclude<DraftField, 'evaluation_method'>; label: string; unit: string; step?: string }[] = [
  { field: 'duration_months', label: 'Contract duration', unit: 'months' },
  { field: 'bid_validity_days', label: 'Bid validity', unit: 'days' },
  { field: 'performance_security_pct', label: 'Performance security', unit: '%', step: '0.5' },
  { field: 'min_similar_contracts', label: 'Minimum similar contracts', unit: '' },
  { field: 'min_similar_value_usd', label: 'Minimum similar contract value', unit: 'USD' },
]
const TONE = { pass: 'low', warn: 'medium', fail: 'high', not_checkable: 'neutral' } as const

type Form = Record<DraftField, string>
const toForm = (v: Partial<Record<DraftField, number | string | null>>): Form => ({
  duration_months: String(v.duration_months ?? ''), bid_validity_days: String(v.bid_validity_days ?? ''), performance_security_pct: String(v.performance_security_pct ?? ''),
  min_similar_contracts: String(v.min_similar_contracts ?? ''), min_similar_value_usd: String(v.min_similar_value_usd ?? ''), evaluation_method: String(v.evaluation_method ?? ''),
})

/**
 * The editor behind "Edit this draft" or "Enter a draft": a draft the assistant suggests from the plan and the contract data, one hint per clause
 * with how it was worked out (or why there is none). The user edits, and Save draft keeps it; the same draft feeds the rest of the app.
 */
function TenderDraftEditor({ projectId }: { projectId: string }) {
  const fiscalYear = useUiStore((s) => s.fiscalYear)
  const { role } = useCurrentUser()
  const project = useProject(projectId).data?.[0]
  const plans = usePlan(projectId).data ?? []
  const storedQuery = useTenderDraft(projectId)
  const stored = storedQuery.data?.[0]
  const contracts = useContracts(projectId, fiscalYear).data ?? []
  const enrichments = useEnrichments().data ?? []
  const history = useTenderHistory().data ?? []
  const allPlans = useAllPlans().data ?? []
  const docs = useDocs().data ?? []
  const chunks = useChunks().data ?? []
  const years = useCountryYears(project?.borrower_country_code ?? '').data ?? []
  const create = useCreateTenderDraft()
  const save = useSaveTenderDraft()

  const [planId, setPlanId] = useState<string | null>(null)
  const plan = plans.find((p) => p.id === planId) ?? plans[0]
  const suggestion = suggestTenderDraft({ plan, contracts, enrichments })
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)

  // Start from the saved draft if there is one, otherwise from the suggestion. The form is then the user's.
  useEffect(() => {
    if (form || !storedQuery.isSuccess) return
    setForm(toForm(stored ?? Object.fromEntries(Object.values(suggestion).map((s) => [s.field, s.value]))))
  }, [storedQuery.isSuccess, stored, form, suggestion])

  if (!project || !storedQuery.isSuccess || !form) return <Card state="loading">{null}</Card>
  if (plans.length === 0 && !stored) {
    return <Card title="Tender draft" aside={<ProvenanceChip kind="missing" />}><EmptyState title="No plan to base a draft on" text="A draft is suggested from a procurement plan. Ask for Planning first, or enter a plan." /></Card>
  }

  const allowed = can(role, 'edit_tender_draft')
  const numbers = { ...Object.fromEntries(NUMERIC.map((n) => [n.field, form[n.field] === '' ? null : Number(form[n.field])])), evaluation_method: form.evaluation_method } as Partial<Record<DraftField, number | string | null>>
  const complete = draftComplete(numbers)
  const set = (field: DraftField, value: string) => { setSaved(false); setForm({ ...form, [field]: value }) }
  const current: TenderDraft | null = complete ? { id: stored?.id ?? `TD-${projectId}`, project_id: projectId, ...(numbers as Record<DraftField, number | string>) } as TenderDraft : null
  const unsaved = !stored || (Object.keys(form) as DraftField[]).some((k) => String(stored[k]) !== form[k])
  const checks = current && plan
    ? specificationChecks({ draft: current, plan, project, contracts, candidates: tenderCandidates(history, allPlans), docs, chunks, evaluationReference: countryReference(years, project.borrower_country_code, 'C5.2') })
    : []
  const first = checks.find((c) => c.status === 'fail') ?? checks.find((c) => c.status === 'warn')
  const count = (s: string) => checks.filter((c) => c.status === s).length
  const pending = create.isPending || save.isPending
  const onSave = () => { if (!current) return; (stored ? save : create).mutate(current, { onSuccess: () => setSaved(true) }) }

  return (
    <div className={styles.card}>
      <p className={styles.lead}>
        {stored
          ? <>A draft is already saved for {project.project_name}. Your figures are below, with my suggestion beside each one.</>
          : <>I prepared a suggested tender draft for {project.project_name}{plan ? <> from the plan <strong>{plan.name}</strong></> : null}. Adjust anything, fill in what I could not suggest, then save it.</>}
        {' '}<ProvenanceChip kind="derived" detail="suggested" />
      </p>

      {plans.length > 1 && (
        <label className={styles.field}>Base the suggestion on this plan
          <Select value={plan?.id ?? ''} onValueChange={setPlanId} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
        </label>
      )}

      <div className={styles.grid}>
        {NUMERIC.map(({ field, label, unit, step }) => {
          const s = suggestion[field]
          const differs = s.value !== null && String(s.value) !== form[field]
          return (
            <label key={field} className={styles.field}>
              <span>{label}{unit && <span className={styles.unit}> ({unit})</span>}</span>
              <input type="number" min={0} step={step ?? '1'} value={form[field]} disabled={!allowed} onChange={(e) => set(field, e.target.value)} />
              <span className={styles.hint}>
                {s.value !== null ? (
                  <>
                    <ProvenanceChip kind="derived" detail={s.n ? `n=${s.n}` : 'suggested'} /> Suggested {typeof s.value === 'number' ? s.value.toLocaleString('en-US') : s.value}. {s.basis}
                    {differs && allowed && <> <button type="button" className={styles.use} onClick={() => set(field, String(s.value))}>Use it</button></>}
                  </>
                ) : (
                  <><ProvenanceChip kind="missing" /> {s.basis}</>
                )}
              </span>
            </label>
          )
        })}
        <label className={styles.field}>
          <span>Evaluation method</span>
          <Select value={form.evaluation_method} placeholder="Choose a method" onValueChange={(v) => set('evaluation_method', v)} disabled={!allowed} options={METHODS.map((m) => ({ value: m, label: m }))} />
          <span className={styles.hint}>
            {suggestion.evaluation_method.value !== null ? (
              <>
                <ProvenanceChip kind="derived" detail="suggested" /> Suggested {suggestion.evaluation_method.value}. {suggestion.evaluation_method.basis}
                {allowed && suggestion.evaluation_method.value !== form.evaluation_method && <> <button type="button" className={styles.use} onClick={() => set('evaluation_method', String(suggestion.evaluation_method.value))}>Use it</button></>}
              </>
            ) : <><ProvenanceChip kind="missing" /> {suggestion.evaluation_method.basis}</>}
          </span>
        </label>
      </div>

      <div className={styles.actions}>
        <Button variant="success" onClick={onSave} disabled={!current || !unsaved || pending} disabledReason={allowed ? undefined : whyDisabled('edit_tender_draft')}>
          {stored ? 'Save draft' : 'Save as the draft'}
        </Button>
        <span role="status" className={styles.sub}>
          {!complete ? 'Fill in every figure to save.' : saved && !unsaved ? 'Saved. This is now the draft for the project, used everywhere in the app.' : unsaved ? 'Not saved yet.' : 'Saved.'}
        </span>
      </div>

      {current && plan && (
        <section className={styles.checks} aria-label="How this draft compares">
          <h4>Against your plan: {plan.name}</h4>
          <ValidityCoverage plan={plan} draft={current} />
          <div className={styles.counts}>
            {(['pass', 'warn', 'fail', 'not_checkable'] as const).map((st) => (
              <Badge key={st} tone={TONE[st]}>{count(st)} {SPEC_STATUS_LABEL[st]}</Badge>
            ))}
            <span className={styles.sub}>{checks.length} rules checked against the plan, the contracts and the guidance note.</span>
          </div>
          {first && <p className={styles.sub}><strong>{first.clause}:</strong> {first.detail}</p>}
        </section>
      )}
    </div>
  )
}

/**
 * The Tender design stage for a project that exists: what its tender draft HAS on record, read only. Nothing is suggested or crafted here.
 * With no draft it says so. Entering or editing a draft for a past project (the editor above) is off while PAST_PROJECTS_EDITABLE is false; a draft for
 * the user's own procurement is asked for in the chat.
 */
export function TenderDraftCard({ projectId, onSend }: { projectId: string; onSend: (text: string) => void }) {
  const { role } = useCurrentUser()
  const project = useProject(projectId).data?.[0]
  const stored = useTenderDraft(projectId)
  const [editing, setEditing] = useState(false)
  if (!project || !stored.isSuccess) return <Card state="loading">{null}</Card>
  const draft = stored.data[0]
  const allowed = can(role, 'edit_tender_draft')

  if (PAST_PROJECTS_EDITABLE && editing) {
    return (
      <div className={styles.card}>
        <TenderDraftEditor projectId={projectId} />
        <div className={styles.actions}><Button onClick={() => setEditing(false)}>Back to the draft on record</Button></div>
      </div>
    )
  }
  if (!draft) {
    return (
      <div className={styles.stack}>
      <Card title="Tender draft on record" aside={<ProvenanceChip kind="missing" />}>
        <EmptyState title={`No tender draft on record for ${project.project_name}`} text={PAST_PROJECTS_EDITABLE ? 'Nothing is made up for an existing project. Tender clauses are not in the public sources, so they appear only when someone enters them. Any tenders the project published are listed below.' : 'Tender clauses are not in the public sources, so none are on record for this project and nothing is made up. Any tenders it published are listed below.'} />
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => onSend('Suggest tender clauses for my own procurement')}>Suggest a draft for my own procurement</Button>
          {PAST_PROJECTS_EDITABLE && <Button onClick={() => setEditing(true)} disabled={!allowed} disabledReason={allowed ? undefined : whyDisabled('edit_tender_draft')}>Enter a draft for this project</Button>}
        </div>
      </Card>
      <TenderNoticesOnRecord projectId={projectId} />
      </div>
    )
  }
  return (
    <div className={styles.stack}>
    <Card title="Tender draft on record" aside={<ProvenanceChip kind="entered" />}>
      <p className={styles.lead}>The draft saved for {project.project_name}. These are the clauses it has, as entered.</p>
      <table className={styles.table}>
        <tbody>
          {NUMERIC.map(({ field, label, unit }) => (
            <tr key={field}><th scope="row">{label}</th><td>{Number(draft[field]).toLocaleString('en-US')}{unit ? ` ${unit}` : ''}</td></tr>
          ))}
          <tr><th scope="row">Evaluation method</th><td>{draft.evaluation_method}</td></tr>
        </tbody>
      </table>
      <div className={styles.actions}>
        {PAST_PROJECTS_EDITABLE && <Button onClick={() => setEditing(true)} disabled={!allowed} disabledReason={allowed ? undefined : whyDisabled('edit_tender_draft')}>Edit this draft</Button>}
        <Button onClick={() => onSend('Suggest tender clauses for my own procurement')}>Suggest a draft for my own procurement</Button>
      </div>
    </Card>
    <TenderNoticesOnRecord projectId={projectId} />
    </div>
  )
}
