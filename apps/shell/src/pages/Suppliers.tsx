import { useState } from 'react'
import { Link } from 'react-router'
import { THRESHOLDS } from '@pi/config'
import { supplierProfiles, useAllContracts, useAmendments, useContractMilestones, useUiStore, type Citation, type SupplierProfile } from '@pi/data'
import { Badge, Card, EmptyState, ProvenanceChip, TableScroll } from '@pi/ui'
import { CitationChip, FeedbackWidget, SourceDrawer } from '@pi/domain'
import styles from './Suppliers.module.css'

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}${unit}`

/** A derived number, or the gate that withholds the verdict while the history is still shown. */
function Derived({ p, children }: { p: SupplierProfile; children: React.ReactNode }) {
  return p.gate.ok ? <>{children}</> : <span className={styles.sub}>{children}</span>
}

export function Suppliers() {
  const projectId = useUiStore((s) => s.projectId)
  const contracts = useAllContracts()
  const amendments = useAmendments().data ?? []
  const milestones = useContractMilestones().data ?? []
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [open, setOpen] = useState<Citation | null>(null)

  if (contracts.isLoading) return <Card state="loading">{null}</Card>
  if (contracts.isError) return <Card state="error">{null}</Card>

  const profiles = supplierProfiles(contracts.data ?? [], amendments, milestones)
  const selected = profiles.find((p) => p.supplierId === pickedId) ?? null

  return (
    <div className={styles.page}>
      <div>
        <h1>Suppliers</h1>
        <p className={styles.sub}>
          Each supplier's history across projects: what it was awarded, how prices moved after signing, and how its milestones went. Contracts, amendments and milestones are <Badge>Mock</Badge> records.
          A flag is a rule over that history, not a judgement of the supplier, and is raised only from {THRESHOLDS.supplierProfileMinContracts} contracts.
        </p>
      </div>

      <Card title="Suppliers" aside={<ProvenanceChip kind="derived" detail={`n=${profiles.length}`} />}>
        {profiles.length === 0 ? <EmptyState title="No contracts on record" text="Supplier history is built from contract awards." /> : (
          <TableScroll>
            <table className={styles.table}>
              <thead><tr><th>Supplier</th><th>Contracts</th><th>Projects</th><th>Committed (USD)</th><th>Price change</th><th>Avg milestone delay</th><th>Flags</th></tr></thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.supplierId} className={`${styles.clickable} ${p.supplierId === selected?.supplierId ? styles.selected : ''}`} onClick={() => setPickedId(p.supplierId === pickedId ? null : p.supplierId)}>
                    <td><button type="button" className={styles.pick} aria-pressed={p.supplierId === pickedId}>{p.name}<br /><span className="mono">{p.supplierId}</span></button></td>
                    <td className="mono">{p.contracts.length}</td>
                    <td className="mono">{p.projects.length}</td>
                    <td className="mono">{usd(p.committedUsd)}</td>
                    <td className="mono"><Derived p={p}>{signed(p.priceChangePct, '%')}</Derived></td>
                    <td className="mono"><Derived p={p}>{p.avgDelayDays === null ? 'none completed' : signed(p.avgDelayDays, ' days')}</Derived></td>
                    <td>{p.gate.ok ? (p.flags.length > 0 ? <Badge tone="high">{p.flags.length} flag{p.flags.length === 1 ? '' : 's'}</Badge> : <Badge tone="low">None</Badge>) : <Badge>Needs {p.gate.required} contracts ({p.gate.n} so far)</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        <p className={styles.sub}>Click a supplier to see its contract history. Grey numbers are shown for reference only: the supplier has fewer than {THRESHOLDS.supplierProfileMinContracts} contracts, so no verdict is given.</p>
      </Card>

      {selected && (
        <Card title={`Profile: ${selected.name}`} aside={<ProvenanceChip kind="derived" detail={`n=${selected.contracts.length} contracts`} />}>
          <div className={styles.layer}>
            <p>
              {selected.contracts.length} contract{selected.contracts.length === 1 ? '' : 's'} on {selected.projects.length} project{selected.projects.length === 1 ? '' : 's'} ({selected.projects.join(', ')}), {usd(selected.committedUsd)} USD committed.
              Approved changes after signing: {signed(selected.valueChangeUsd, ' USD')} ({signed(selected.priceChangePct, '%')}); {selected.timeExtensionContracts} contract{selected.timeExtensionContracts === 1 ? '' : 's'} with an approved time extension;
              {selected.avgDelayDays === null ? ' no completed milestones.' : ` ${selected.completedMilestones} completed milestone${selected.completedMilestones === 1 ? '' : 's'}, ${signed(selected.avgDelayDays, ' days')} against plan on average.`}
            </p>

            {selected.gate.ok ? (
              selected.flags.length === 0 ? (
                <div className={styles.detail}><Badge tone="low">No shortfall flags</Badge><p className={styles.sub}>None of the three rules fired on {selected.contracts.length} contracts.</p></div>
              ) : (
                <ul className={styles.list}>
                  {selected.flags.map((f) => (
                    <li key={f.id} className={styles.detail}>
                      <div className={styles.row}><Badge tone="high">Shortfall flag</Badge><ProvenanceChip kind="derived" /></div>
                      <p>{f.text}</p>
                      <div className={styles.row}>{f.evidence.map((c) => <CitationChip key={c.ref_id} citation={c} onOpen={setOpen} />)}</div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <EmptyState title="Not enough contracts to judge" text={`Needs ${selected.gate.required} contracts. ${selected.gate.n} so far, so the history below is shown without any flag.`} />
            )}

            <TableScroll>
              <table className={styles.table}>
                <thead><tr><th>Contract</th><th>Project</th><th>Signed</th><th>Amount (USD)</th><th>Approved change</th><th>Time added</th><th>Milestones vs plan</th></tr></thead>
                <tbody>
                  {selected.contracts.map((r) => (
                    <tr key={r.contract.borrower_contract_reference_number}>
                      <td><span className="mono">{r.contract.borrower_contract_reference_number}</span><br /><span className={styles.sub}>{r.contract.procurement_category}</span></td>
                      <td className="mono">{r.contract.project_id}{r.contract.project_id === projectId && <> <Badge>Selected</Badge></>}</td>
                      <td className="mono">{r.contract.contract_signing_date}</td>
                      <td className="mono">{usd(r.contract.supplier_contract_amount_usd)}</td>
                      <td className="mono">{r.amendments.length === 0 ? <ProvenanceChip kind="missing" detail="none approved" /> : <>{signed(r.valueChangeUsd, '')} ({signed(r.valueChangePct, '%')}) {r.amendments.map((a) => <CitationChip key={a.id} citation={{ ref_type: 'record', ref_id: a.id, label: a.id }} onOpen={setOpen} />)}</>}</td>
                      <td className="mono">{r.daysAdded > 0 ? signed(r.daysAdded, ' days') : '—'}</td>
                      <td>{r.milestones.length === 0 ? <ProvenanceChip kind="missing" detail="none completed" /> : r.milestones.map((m) => <div key={m.milestone.id}><CitationChip citation={{ ref_type: 'record', ref_id: m.milestone.id, label: m.milestone.name }} onOpen={setOpen} /> <span className="mono">{m.delayDays === 0 ? 'on time' : signed(m.delayDays, ' days')}</span></div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <p className={styles.sub}>
              Price change = approved value changes ÷ contract amounts, including contracts still running. Delay = actual minus planned date of completed milestones. Pending and rejected amendments are not counted.
              Thresholds ({THRESHOLDS.supplierPriceGrowthPct}% price, {THRESHOLDS.supplierDelayDays} days delay, {Math.round(THRESHOLDS.supplierTimeExtensionShare * 100)}% of contracts extended) are in <span className="mono">THRESHOLDS</span>. See <Link to="/project-data">Project data</Link> for amendments on the selected project.
            </p>
            <div className={styles.feedback}>
              <span>Was this profile useful?</span>
              <FeedbackWidget targetId={`AI-LAYER-supplier-${selected.supplierId}`} />
            </div>
          </div>
        </Card>
      )}
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
