import { ENRICHMENT_FIELDS, approvedValues, tenderCoverage, useContracts, useEnrichments, type EnrichmentField } from '@pi/data'
import { Badge, Card, Paged, ProvenanceChip, SupplierName } from '@pi/ui'
import { MissingInfo } from './CardBoundary'
import styles from './ToolCards.module.css'

const FIELD_LABEL: Record<EnrichmentField, string> = {
  advertised_date: 'Advertised', bids_opened_date: 'Bids opened', bidders_received: 'Bidders', bidders_qualified: 'Qualified', bid_validity_days: 'Bid validity (days)', contract_end_date: 'End date',
}

/**
 * The project's contracts: public columns locked, tender facts entered by the team. A fact nobody has entered shows as Missing,
 * and a fact waiting for a reviewer shows as Pending review. Entering data stays on the Project data page; this is the read view.
 */
export function ContractsCard({ projectId }: { projectId: string }) {
  const contracts = useContracts(projectId)
  const enrichments = useEnrichments().data ?? []
  if (contracts.isLoading) return <Card state="loading">{null}</Card>
  if (contracts.isError) return <Card state="error">{null}</Card>
  const rows = contracts.data ?? []
  if (rows.length === 0) return <MissingInfo title="Contracts" text="No contracts are on record for this project. Contract awards are public records; none have been loaded for it." />
  const approved = approvedValues(enrichments)
  const { covered, total } = tenderCoverage(rows, enrichments)
  const cell = (ref: string, f: EnrichmentField) => {
    const v = approved.get(`${ref}:${f}`)
    if (v) return <>{v} <ProvenanceChip kind="entered" /></>
    const pending = enrichments.find((e) => e.contract_ref === ref && e.field === f && e.status === 'pending')
    return pending ? <>{pending.value} <Badge tone="medium">Pending review</Badge></> : <ProvenanceChip kind="missing" />
  }
  return (
    <Card title="Contracts" aside={<ProvenanceChip kind="public" detail={`n=${rows.length}`} />}>
      <p className={styles.sub}>Public contract awards are locked. Tender facts are entered per contract and approved by a reviewer: {covered} of {total} contracts have approved entries so far.</p>
      <Paged items={rows} label="contracts" maxHeight="420px">{(page) =>
        <table className={styles.table}>
          <thead><tr><th>Reference</th><th>Supplier</th><th>Category</th><th>Amount (USD)</th><th>Signed</th>{ENRICHMENT_FIELDS.map((f) => <th key={f}>{FIELD_LABEL[f]}</th>)}</tr></thead>
          <tbody>
            {page.map((c) => {
              const ref = c.borrower_contract_reference_number
              return (
                <tr key={ref}>
                  <td className={styles.mono}>{ref}</td>
                  <td><SupplierName name={c.supplier} /> <ProvenanceChip kind="public" /></td>
                  <td>{c.procurement_category}</td>
                  <td className={styles.mono}>{c.supplier_contract_amount_usd.toLocaleString('en-US')}</td>
                  <td className={styles.mono}>{c.contract_signing_date}</td>
                  {ENRICHMENT_FIELDS.map((f) => <td key={f} className={styles.mono}>{cell(ref, f)}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>}
      </Paged>
    </Card>
  )
}
