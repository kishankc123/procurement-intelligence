import { Fragment, useState } from 'react'
import { can, whyDisabled } from '@pi/config'
import { useCurrentUser, usePlanPackages, useProject, useSavePlanPackage, useSaveTenderNotice, useTenderNotices, type PlanPackage, type TenderNotice } from '@pi/data'
import { Badge, Button, Card, ProvenanceChip } from '@pi/ui'
import { EditRowDialog, type EditField } from './EditRowDialog'
import styles from './OnRecordCards.module.css'

const PLAN_FIELDS: EditField[] = [
  { key: 'ref_no', label: 'Reference' }, { key: 'description', label: 'Description', required: true }, { key: 'estimated_cost', label: 'Estimated cost (as the document writes it)' },
  { key: 'method', label: 'Method' }, { key: 'review', label: 'Review (Prior or Post)' }, { key: 'expected_bid_opening', label: 'Expected bid opening' },
]
const TENDER_FIELDS: EditField[] = [
  { key: 'reference', label: 'Reference', required: true }, { key: 'description', label: 'Description', required: true }, { key: 'category', label: 'Category', required: true }, { key: 'method', label: 'Method', required: true },
  { key: 'posted', label: 'Posted', type: 'date', required: true }, { key: 'deadline', label: 'Bids due', type: 'date' },
]

/** A source field the document left empty. That is different from the app not having read it. */
const text = (v: string | null | undefined) => v || <span className={styles.none}>not stated</span>

/** The keyboard and mouse behaviour of a row that opens into details, the same as the donut's plans list. */
const rowProps = (open: boolean, toggle: () => void) => ({
  className: `${styles.clickable} ${open ? styles.selected : ''}`, tabIndex: 0, 'aria-expanded': open,
  onClick: toggle, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } },
})

/**
 * The procurement plan a project has on record, in the same layout as the Plans list of the Planning stage: the package rows read from its newest World
 * Bank plan document, as the document writes them (cost, method and dates are the document's own text). A row opens into its details and an Edit button.
 */
export function PlanOnRecord({ projectId }: { projectId: string }) {
  const project = useProject(projectId).data?.[0]
  const rows = usePlanPackages(projectId)
  const { role } = useCurrentUser()
  const save = useSavePlanPackage()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<PlanPackage | null>(null)
  const allowed = can(role, 'edit_plan')
  if (!rows.isSuccess || !project) return <Card state="loading">{null}</Card>
  if (rows.data.length === 0) return null
  const first = rows.data[0]!
  const unit = first.cost_unit
  return (
    <div className={styles.chatCard}>
      <p className={styles.chatSummary}>
        <strong>{rows.data.length} procurement plan {rows.data.length === 1 ? 'row' : 'rows'}</strong> for {project.project_name}, read from the World Bank procurement plan of <span className="mono">{first.plan_date}</span>, as the document writes them.{' '}
        <ProvenanceChip kind="public" />
      </p>
      <Card title="Plans" aside={<ProvenanceChip kind="public" detail={`plan of ${first.plan_date}`} />}>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Plan rows, scrollable">
            <table className={`${styles.table} ${styles.rows}`}>
              <thead><tr><th>Plan</th><th>Estimated cost{unit ? ` (${unit})` : ''}</th><th>Method</th><th>Expected bid opening</th><th aria-label="Status" /></tr></thead>
              <tbody>
                {rows.data.map((r) => {
                  const open = r.id === selectedId
                  const toggle = () => setSelectedId(open ? null : r.id)
                  return (
                    <Fragment key={r.id}>
                      <tr {...rowProps(open, toggle)}>
                        <td>{r.description}<br /><span className={`mono ${styles.nowrap}`}>{r.ref_no ?? r.id}</span></td>
                        <td className={styles.num} data-label="Estimated cost">{text(r.estimated_cost)}</td>
                        <td data-label="Method">{text(r.method)}</td>
                        <td className={styles.nowrap} data-label="Expected bid opening">{text(r.expected_bid_opening)}</td>
                        <td>{r.edited && <Badge>Edited</Badge>}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={5} className={styles.expandedCell}>
                            <div className={styles.expanded}>
                              <div className={styles.expandedHead}>
                                <strong>{r.ref_no ?? r.id}</strong>
                                <span>
                                  <Button onClick={() => setEditing(r)} disabled={!allowed} disabledReason={allowed ? undefined : whyDisabled('edit_plan')}>Edit</Button>{' '}
                                  <Button onClick={() => setSelectedId(null)}>Close</Button>
                                </span>
                              </div>
                              <dl className={styles.facts}>
                                <div><dt>Category</dt><dd>{text(r.category)}</dd></div>
                                <div><dt>Review by the Bank</dt><dd>{text(r.review)}</dd></div>
                                <div><dt>Packages in the row</dt><dd>{text(r.packages)}</dd></div>
                                <div><dt>Plan document</dt><dd><a href={r.source_url} target="_blank" rel="noreferrer">{r.plan_doc}</a> · {r.plan_date}</dd></div>
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        <p className={styles.sub}>Each row is a package in the plan. The plan holds more packages than these first rows, and the oldest often come first. Click a row to see its details and edit it.</p>
      </Card>
      {editing && (
        <EditRowDialog open onOpenChange={(o) => { if (!o) setEditing(null) }} title="Edit plan row" description={`${editing.ref_no ?? 'Row'} · saved as entered by you, the document is not changed`}
          fields={PLAN_FIELDS} row={editing as unknown as Record<string, unknown>} pending={save.isPending}
          onSave={(next) => save.mutate(next as unknown as PlanPackage, { onSuccess: () => setEditing(null) })} />
      )}
    </div>
  )
}

/** The tenders a project published, in the same layout: a summary line, a Tenders card with a compact table, rows that open into details, an Edit button and the notice link. */
export function TenderNoticesOnRecord({ projectId }: { projectId: string }) {
  const project = useProject(projectId).data?.[0]
  const notices = useTenderNotices(projectId)
  const { role } = useCurrentUser()
  const save = useSaveTenderNotice()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TenderNotice | null>(null)
  const allowed = can(role, 'edit_tender_facts')
  if (!notices.isSuccess || !project) return <Card state="loading">{null}</Card>
  if (notices.data.length === 0) return null
  const rows = [...notices.data].sort((a, b) => b.posted.localeCompare(a.posted))
  return (
    <div className={styles.chatCard}>
      <p className={styles.chatSummary}>
        <strong>{rows.length} {rows.length === 1 ? 'tender' : 'tenders'} published</strong> for {project.project_name}, newest first, from the World Bank procurement notices.{' '}
        <ProvenanceChip kind="public" />
      </p>
      <Card title="Tenders" aside={<ProvenanceChip kind="public" detail={`${rows.length} notices`} />}>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Tenders, scrollable">
            <table className={`${styles.table} ${styles.rows}`}>
              <thead><tr><th>Tender</th><th>Posted</th><th>Bids due</th><th>Method</th><th aria-label="Status" /></tr></thead>
              <tbody>
                {rows.map((n) => {
                  const open = n.id === selectedId
                  const toggle = () => setSelectedId(open ? null : n.id)
                  return (
                    <Fragment key={n.id}>
                      <tr {...rowProps(open, toggle)}>
                        <td>{text(n.description)}<br /><span className={`mono ${styles.nowrap}`}>{n.reference || n.id}</span></td>
                        <td className={`mono ${styles.nowrap}`} data-label="Posted">{n.posted}</td>
                        <td className={`mono ${styles.nowrap}`} data-label="Bids due">{text(n.deadline)}</td>
                        <td data-label="Method">{n.method}</td>
                        <td>{n.edited && <Badge>Edited</Badge>}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={5} className={styles.expandedCell}>
                            <div className={styles.expanded}>
                              <div className={styles.expandedHead}>
                                <strong>{n.reference || n.id}</strong>
                                <span>
                                  <Button onClick={() => setEditing(n)} disabled={!allowed} disabledReason={allowed ? undefined : whyDisabled('edit_tender_facts')}>Edit</Button>{' '}
                                  <Button onClick={() => setSelectedId(null)}>Close</Button>
                                </span>
                              </div>
                              <dl className={styles.facts}>
                                <div><dt>Category</dt><dd>{n.category}</dd></div>
                                <div><dt>Published by</dt><dd>{n.organization}</dd></div>
                                <div><dt>Status</dt><dd>{n.status}</dd></div>
                                <div><dt>World Bank notice</dt><dd><a href={n.url} target="_blank" rel="noreferrer">{n.id}</a></dd></div>
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        <p className={styles.sub}>Invitation for Bids notices. Bid validity, security and the other clauses are in the bidding documents, which are not in these notices. Click a row to see its details and edit it.</p>
      </Card>
      {editing && (
        <EditRowDialog open onOpenChange={(o) => { if (!o) setEditing(null) }} title="Edit tender notice" description={`${editing.id} · saved as entered by you, the World Bank notice is not changed`}
          fields={TENDER_FIELDS} row={editing as unknown as Record<string, unknown>} pending={save.isPending}
          onSave={(next) => save.mutate(next as unknown as TenderNotice, { onSuccess: () => setEditing(null) })} />
      )}
    </div>
  )
}
