import { useState } from 'react'
import { can, whyDisabled, type Permission } from '@pi/config'
import {
  ENRICHMENT_FIELDS, approvedValues, tenderCoverage, useAddAmendment, useAddEnrichment, useAmendments, useAuditLog,
  useContracts, useCurrentUser, useEnrichments, useReviewAmendment, useReviewEnrichment, useUiStore,
  type EnrichmentField,
} from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip, Select } from '@pi/ui'
import styles from './ProjectData.module.css'

const FIELD_LABEL: Record<EnrichmentField, string> = {
  advertised_date: 'Advertised date', bids_opened_date: 'Bids opened date', bidders_received: 'Bidders received',
  bidders_qualified: 'Bidders qualified', bid_validity_days: 'Bid validity (days)', contract_end_date: 'Contract end date',
}
const isDate = (f: EnrichmentField) => f.endsWith('_date')
const permissionFor = (f: EnrichmentField): Permission => (f === 'contract_end_date' ? 'edit_contract_end' : 'edit_tender_facts')

export function ProjectData() {
  const { projectId, fiscalYear } = useUiStore()
  const { role } = useCurrentUser()
  const contracts = useContracts(projectId, fiscalYear)
  const enrichments = useEnrichments().data ?? []
  const amendments = useAmendments().data ?? []
  const audit = useAuditLog().data ?? []
  const addEnrichment = useAddEnrichment()
  const addAmendment = useAddAmendment()
  const reviewEnrichment = useReviewEnrichment()
  const reviewAmendment = useReviewAmendment()

  const [search, setSearch] = useState('')
  const [ref, setRef] = useState('')
  const [field, setField] = useState<EnrichmentField>('contract_end_date')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [amd, setAmd] = useState({ type: 'Time extension', date: '', days: '', value: '0', reason: '' })

  if (contracts.isLoading) return <Card state="loading">{null}</Card>
  if (contracts.isError) return <Card state="error">{null}</Card>
  const rows = contracts.data ?? []
  const selected = ref || rows[0]?.borrower_contract_reference_number || ''
  const visible = rows.filter((c) => `${c.borrower_contract_reference_number} ${c.supplier} ${c.procurement_category}`.toLowerCase().includes(search.toLowerCase()))
  const approved = approvedValues(enrichments)
  const { covered, total } = tenderCoverage(rows, enrichments)

  // Validation: bids opened must not be before advertised (uses any non-rejected advertised value).
  const advertised = enrichments.filter((e) => e.contract_ref === selected && e.field === 'advertised_date' && e.status !== 'rejected').at(-1)?.value
  const error = field === 'bids_opened_date' && advertised && value && value < advertised
    ? `Bids opened (${value}) cannot be before advertised (${advertised}).` : ''
  const allowedField = can(role, permissionFor(field))
  const pendingEnr = enrichments.filter((e) => e.status === 'pending')
  const pendingAmd = amendments.filter((a) => a.status === 'pending')
  const canReview = can(role, 'approve_entries')

  const cell = (contractRef: string, f: EnrichmentField) => {
    const v = approved.get(`${contractRef}:${f}`)
    if (v) return <>{v} <ProvenanceChip kind="entered" /></>
    const p = enrichments.find((e) => e.contract_ref === contractRef && e.field === f && e.status === 'pending')
    return p ? <>{p.value} <Badge tone="medium">Pending review</Badge></> : <ProvenanceChip kind="missing" />
  }

  return (
    <div className={styles.page}>
      <div><h1>Project data</h1><p className={styles.sub}>Public contract awards are locked. Tender facts are entered per contract and approved by a reviewer. Coverage: {covered} of {total} contracts.</p></div>

      <Card title="Contracts" aside={<input aria-label="Search contracts" placeholder="Search contracts" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        {visible.length === 0 ? <EmptyState title="No contracts match" text="Check the project and fiscal-year filters." /> : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr>
                <th>Reference</th><th>Supplier</th><th>Category</th><th>Amount (USD)</th><th>Signed</th>
                {ENRICHMENT_FIELDS.map((f) => <th key={f}>{FIELD_LABEL[f]}</th>)}
              </tr></thead>
              <tbody>
                {visible.map((c) => {
                  const r = c.borrower_contract_reference_number
                  return (
                    <tr key={r}>
                      <td className="mono">{r}</td>
                      <td>{c.supplier} <ProvenanceChip kind="public" /></td>
                      <td>{c.procurement_category}</td>
                      <td className="mono">{c.supplier_contract_amount_usd.toLocaleString()}</td>
                      <td className="mono">{c.contract_signing_date}</td>
                      {ENRICHMENT_FIELDS.map((f) => <td key={f}>{cell(r, f)}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className={styles.two}>
        <Card title="Enter tender data" aside={<ProvenanceChip kind="entered" />}>
          <form className={styles.form} onSubmit={(e) => {
            e.preventDefault()
            addEnrichment.mutate({ contract_ref: selected, field, value, fiscal_year: fiscalYear, source_note: note }, { onSuccess: () => { setValue(''); setNote('') } })
          }}>
            <label>Contract<Select value={selected} onValueChange={setRef} options={rows.map((c) => ({ value: c.borrower_contract_reference_number, label: c.borrower_contract_reference_number }))} /></label>
            <label>Field<Select value={field} onValueChange={(v) => { setField(v as EnrichmentField); setValue('') }} options={ENRICHMENT_FIELDS.map((f) => ({ value: f, label: FIELD_LABEL[f] }))} /></label>
            <label>Value<input type={isDate(field) ? 'date' : 'number'} min={0} value={value} onChange={(e) => setValue(e.target.value)} required /></label>
            <label>Source note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where this came from" /></label>
            <Button type="submit" variant="primary" disabled={!value || Boolean(error) || addEnrichment.isPending} disabledReason={allowedField ? undefined : whyDisabled(permissionFor(field))}>Submit for review</Button>
            {error && <p role="alert">{error}</p>}
          </form>
        </Card>

        <Card title="Record an amendment" aside={<ProvenanceChip kind="entered" />}>
          <form className={styles.form} onSubmit={(e) => {
            e.preventDefault()
            addAmendment.mutate({ contract_ref: selected, type: amd.type, date: amd.date, days_added: Number(amd.days), value_change_usd: Number(amd.value), reason: amd.reason }, { onSuccess: () => setAmd({ ...amd, date: '', days: '', reason: '' }) })
          }}>
            <label>Type<Select value={amd.type} onValueChange={(v) => setAmd({ ...amd, type: v })} options={['Time extension', 'Value change', 'Scope change'].map((t) => ({ value: t, label: t }))} /></label>
            <label>Date<input type="date" value={amd.date} onChange={(e) => setAmd({ ...amd, date: e.target.value })} required /></label>
            <label>Days added<input type="number" min={0} value={amd.days} onChange={(e) => setAmd({ ...amd, days: e.target.value })} required /></label>
            <label>Value change (USD)<input type="number" value={amd.value} onChange={(e) => setAmd({ ...amd, value: e.target.value })} /></label>
            <label>Reason<input value={amd.reason} onChange={(e) => setAmd({ ...amd, reason: e.target.value })} required /></label>
            <Button type="submit" variant="primary" disabled={addAmendment.isPending} disabledReason={can(role, 'edit_amendments') ? undefined : whyDisabled('edit_amendments')}>Submit for review ({selected})</Button>
          </form>
        </Card>
      </div>

      <Card title="Awaiting review" aside={<span className={styles.sub}>Reviewer approves or rejects</span>}>
        {pendingEnr.length + pendingAmd.length === 0 ? <EmptyState title="Nothing pending" text="Entries from planners and contract managers appear here." /> : (
          <table className={styles.table}>
            <thead><tr><th>Entry</th><th>Contract</th><th>By</th><th>Decision</th></tr></thead>
            <tbody>
              {pendingEnr.map((e) => (
                <tr key={e.id}><td>{FIELD_LABEL[e.field]}: <span className="mono">{e.value}</span></td><td className="mono">{e.contract_ref}</td><td>{e.entered_by_role.replace('_', ' ')}</td>
                  <td className={styles.actions}>
                    <Button onClick={() => reviewEnrichment.mutate({ id: e.id, status: 'approved' })} disabledReason={canReview ? undefined : whyDisabled('approve_entries')}>Approve</Button>
                    <Button onClick={() => reviewEnrichment.mutate({ id: e.id, status: 'rejected' })} disabledReason={canReview ? undefined : whyDisabled('approve_entries')}>Reject</Button></td></tr>
              ))}
              {pendingAmd.map((a) => (
                <tr key={a.id}><td>{a.type}: +{a.days_added} days ({a.reason})</td><td className="mono">{a.contract_ref}</td><td>{a.entered_by_role.replace('_', ' ')}</td>
                  <td className={styles.actions}>
                    <Button onClick={() => reviewAmendment.mutate({ id: a.id, status: 'approved' })} disabledReason={canReview ? undefined : whyDisabled('approve_entries')}>Approve</Button>
                    <Button onClick={() => reviewAmendment.mutate({ id: a.id, status: 'rejected' })} disabledReason={canReview ? undefined : whyDisabled('approve_entries')}>Reject</Button></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Audit trail">
        {audit.length === 0 ? <EmptyState title="No changes yet" /> : (
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Role</th><th>Action</th><th>Target</th></tr></thead>
            <tbody>{[...audit].reverse().slice(0, 8).map((a) => (
              <tr key={a.id}><td className="mono">{a.at.slice(0, 19).replace('T', ' ')}</td><td>{a.role.replace('_', ' ')}</td><td>{a.action}</td><td className="mono">{a.target}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
