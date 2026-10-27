import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { can, whyDisabled } from '@pi/config'
import { tenderComparison, useContracts, useCurrentUser, useEnrichments, usePlan, useSaveTenderDraft, useTenderDraft, useUiStore, type Citation, type TenderDraft } from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { CitationChip, SourceDrawer } from '@pi/domain'
import styles from './ProjectData.module.css'

const METHODS = ['Lowest evaluated price', 'Quality and cost based', 'Fixed budget']

export function TenderDesign() {
  const { projectId, fiscalYear } = useUiStore()
  const { role } = useCurrentUser()
  const stored = useTenderDraft(projectId).data?.[0]
  const plan = usePlan(projectId).data?.[0]
  const contracts = useContracts(projectId, fiscalYear).data ?? []
  const enrichments = useEnrichments().data ?? []
  const save = useSaveTenderDraft()
  const [draft, setDraft] = useState<TenderDraft | undefined>(stored)
  const [open, setOpen] = useState<Citation | null>(null)
  useEffect(() => setDraft(stored), [stored])

  if (!draft || !stored) return <Card state="loading">{null}</Card>
  const allowed = can(role, 'edit_tender_draft')
  const num = (k: 'duration_months' | 'bid_validity_days' | 'performance_security_pct' | 'min_similar_contracts' | 'min_similar_value_usd', label: string) => (
    <label>{label}<input type="number" min={0} value={draft[k]} disabled={!allowed} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} /></label>
  )
  // Comparison reflects the unsaved draft so the finding changes as K types.
  const rows = tenderComparison(draft, plan, contracts, enrichments)

  return (
    <div className={styles.page}>
      <div><h1>Tender design</h1><p className={styles.sub}>Draft the clauses, then compare them with your plan and with benchmarks from entered contract data.</p></div>
      <div className={styles.two}>
        <Card title="Draft clauses" aside={<ProvenanceChip kind="entered" />}>
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); save.mutate(draft) }}>
            {num('duration_months', 'Contract duration (months)')}
            {num('bid_validity_days', 'Bid validity (days)')}
            {num('performance_security_pct', 'Performance security (%)')}
            {num('min_similar_contracts', 'Minimum similar contracts')}
            {num('min_similar_value_usd', 'Minimum similar contract value (USD)')}
            <label>Evaluation method<select value={draft.evaluation_method} disabled={!allowed} onChange={(e) => setDraft({ ...draft, evaluation_method: e.target.value })}>
              {METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <Button type="submit" variant="primary" disabled={save.isPending} disabledReason={allowed ? undefined : whyDisabled('edit_tender_draft')}>Save draft</Button>
            {save.isSuccess && <p role="status" className={styles.sub}>Saved.</p>}
          </form>
        </Card>
        <Card title="Comparison" aside={<ProvenanceChip kind="derived" />}>
          {rows.map((r) => (
            <table className={styles.table} key={r.label}><tbody>
              <tr><th>{r.label}</th><td className="mono">{r.draft}</td><td><ProvenanceChip kind="entered" detail="draft" /></td></tr>
              <tr><th>Benchmark</th>
                {'gated' in r.benchmark
                  ? <td colSpan={2}><EmptyState title="Missing" text={`Needs ${r.benchmark.gated.required} contracts with this field entered. ${r.benchmark.gated.n} so far.`} action={<Link to="/project-data">Add tender data</Link>} /></td>
                  : <><td className="mono">{r.benchmark.value}</td><td><ProvenanceChip kind="derived" detail={`n=${r.benchmark.n}`} /></td></>}
              </tr>
              {r.finding && <tr><th>Finding</th><td colSpan={2}>
                <p>{r.finding.text}</p>
                <div>{r.finding.citations.map((c) => <CitationChip key={c.ref_id} citation={c} onOpen={setOpen} />)} <Badge>Derived from your plan</Badge></div>
              </td></tr>}
            </tbody></table>
          ))}
        </Card>
      </div>
      <Card title="Qualification and assistant"><EmptyState title="Planned" text="The qualification card and the retrieval assistant are specified but not built yet." /></Card>
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
