import { useState } from 'react'
import { supplierProfiles, useAllContracts, useAmendments, useContractMilestones } from '@pi/data'
import { Badge, Card, EmptyState, Paged, ProvenanceChip, SupplierName } from '@pi/ui'
import { MissingInfo } from './CardBoundary'
import styles from './ToolCards.module.css'

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}${unit}`

/**
 * The suppliers of one project, each with its history across all projects (how prices moved after signing, how its milestones went).
 * A verdict needs enough contracts; below that the numbers are shown without one. No supplier data is a plain missing-information note.
 */
export function SuppliersCard({ projectId }: { projectId: string }) {
  const contracts = useAllContracts()
  const amendments = useAmendments().data ?? []
  const milestones = useContractMilestones().data ?? []
  const [pickedId, setPickedId] = useState<string | null>(null)

  if (contracts.isLoading) return <Card state="loading">{null}</Card>
  if (contracts.isError) return <Card state="error">{null}</Card>
  const profiles = supplierProfiles(contracts.data ?? [], amendments, milestones)
    .filter((p) => p.contracts.some((r) => r.contract.project_id === projectId))
    .sort((a, b) => b.committedUsd - a.committedUsd)
  if (profiles.length === 0) return <MissingInfo title="Suppliers" text="No contracts are on record for this project, so there are no suppliers to list. Supplier history is built from contract awards." />
  const here = (p: (typeof profiles)[number]) => p.contracts.filter((r) => r.contract.project_id === projectId)
  const selected = profiles.find((p) => p.supplierId === pickedId) ?? null

  return (
    <div className={styles.card}>
      <Card title="Suppliers on this project" aside={<ProvenanceChip kind="derived" detail={`n=${profiles.length}`} />}>
        <Paged items={profiles} label="suppliers" maxHeight="420px">{(rows) =>
          <table className={styles.table}>
            <thead><tr><th>Supplier</th><th>Contracts here</th><th>All projects</th><th>Committed here (USD)</th><th>Price change</th><th>Flags</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.supplierId} className={p.supplierId === selected?.supplierId ? styles.selected : undefined}>
                  <td><button type="button" className={styles.pick} aria-pressed={p.supplierId === pickedId} onClick={() => setPickedId(p.supplierId === pickedId ? null : p.supplierId)}><SupplierName name={p.name} /><span className={`${styles.mono} ${styles.sub}`}>{p.supplierId}</span></button></td>
                  <td className={styles.mono}>{here(p).length}</td>
                  <td className={styles.mono}>{p.contracts.length} on {p.projects.length}</td>
                  <td className={styles.mono}>{usd(here(p).reduce((n, r) => n + r.contract.supplier_contract_amount_usd, 0))}</td>
                  <td className={styles.mono}>{p.gate.ok ? signed(p.priceChangePct, '%') : <span className={styles.sub}>{signed(p.priceChangePct, '%')}</span>}</td>
                  <td>{p.gate.ok ? (p.flags.length > 0 ? <Badge tone="high">{p.flags.length} flag{p.flags.length === 1 ? '' : 's'}</Badge> : <Badge tone="low">None</Badge>) : <Badge>Needs {p.gate.required} contracts ({p.gate.n} so far)</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </Paged>
        <p className={styles.sub}>Click a supplier for its contracts across projects. Grey numbers are for reference: with too few contracts no verdict is given.</p>
      </Card>
      {selected && (
        <div className={styles.detail} aria-live="polite">
          <strong><SupplierName name={selected.name} /></strong>
          <p className={styles.sub}>{selected.contracts.length} contracts on {selected.projects.length} {selected.projects.length === 1 ? 'project' : 'projects'}, {usd(selected.committedUsd)} USD committed.{selected.avgDelayDays === null ? ' No milestone has completed, so there is no delay figure.' : ` Completed milestones finished ${signed(selected.avgDelayDays, ' days')} against plan on average.`}</p>
          {selected.gate.ok && selected.flags.length > 0 && <ul>{selected.flags.map((f) => <li key={f.id}>{f.text}</li>)}</ul>}
          {selected.contracts.length === 0 ? <EmptyState title="No contracts" /> : (
            <ul>{selected.contracts.map((r) => <li key={r.contract.borrower_contract_reference_number}><span className={styles.mono}>{r.contract.borrower_contract_reference_number}</span> · {r.contract.project_id} · signed {r.contract.contract_signing_date} · USD {usd(r.contract.supplier_contract_amount_usd)}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  )
}
