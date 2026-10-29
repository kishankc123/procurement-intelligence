import { useState } from 'react'
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

/** Shown when a source field is empty: the document left it blank, which is different from the app not having read it. */
const text = (v: string | null) => v ?? <span className={styles.none}>not stated</span>

/**
 * The procurement plan a project has on record: the package rows read from its newest World Bank plan document, copied as the document writes them
 * (cost, method and dates are the document's own text). It is a plan that existed, not a suggestion.
 */
export function PlanOnRecord({ projectId }: { projectId: string }) {
  const project = useProject(projectId).data?.[0]
  const rows = usePlanPackages(projectId)
  const { role } = useCurrentUser()
  const save = useSavePlanPackage()
  const [editing, setEditing] = useState<PlanPackage | null>(null)
  const allowed = can(role, 'edit_plan')
  if (!rows.isSuccess || !project) return <Card state="loading">{null}</Card>
  if (rows.data.length === 0) return null
  const first = rows.data[0]!
  const unit = first.cost_unit
  return (
    <Card title="Procurement plan on record" aside={<ProvenanceChip kind="public" detail={`plan of ${first.plan_date}`} />}>
      <p className={styles.lead}>
        {rows.data.length} rows from the World Bank procurement plan of {first.plan_date} for {project.project_name}, as the document writes them.
        The plan holds more packages than these first rows, and the oldest packages often come first. <a href={first.source_url} target="_blank" rel="noreferrer">Open the plan document</a>
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr><th scope="col">Reference</th><th scope="col">Description</th><th scope="col">Estimated cost{unit ? ` (${unit})` : ''}</th><th scope="col">Method</th><th scope="col">Review</th><th scope="col">Expected bid opening</th><th scope="col"><span className="sr-only">Edit</span></th></tr>
          </thead>
          <tbody>
            {rows.data.map((r) => (
              <tr key={r.id}>
                <td className="mono">{text(r.ref_no)}</td>
                <td>{r.description}{r.packages ? <span className={styles.none}> · {r.packages} packages</span> : null}</td>
                <td className={styles.num}>{text(r.estimated_cost)}</td>
                <td>{text(r.method)}</td>
                <td>{text(r.review)}</td>
                <td>{text(r.expected_bid_opening)}</td>
                <td className={styles.edit}>
                  {r.edited && <Badge>Edited</Badge>}{' '}
                  <Button onClick={() => setEditing(r)} disabled={!allowed} disabledReason={allowed ? undefined : whyDisabled('edit_plan')}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <EditRowDialog open onOpenChange={(o) => { if (!o) setEditing(null) }} title="Edit plan row" description={`${editing.ref_no ?? 'Row'} · saved as entered by you, the document is not changed`}
          fields={PLAN_FIELDS} row={editing as unknown as Record<string, unknown>} pending={save.isPending}
          onSave={(next) => save.mutate(next as unknown as PlanPackage, { onSuccess: () => setEditing(null) })} />
      )}
    </Card>
  )
}

const SHOWN = 8

/** The tenders (Invitation for Bids notices) a project published, newest first, each linking to its notice on the World Bank site. */
export function TenderNoticesOnRecord({ projectId }: { projectId: string }) {
  const notices = useTenderNotices(projectId)
  const { role } = useCurrentUser()
  const save = useSaveTenderNotice()
  const [editing, setEditing] = useState<TenderNotice | null>(null)
  const allowed = can(role, 'edit_tender_facts')
  const [all, setAll] = useState(false)
  if (!notices.isSuccess) return <Card state="loading">{null}</Card>
  if (notices.data.length === 0) return null
  const rows = [...notices.data].sort((a, b) => b.posted.localeCompare(a.posted))
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Card title="Tenders published" aside={<ProvenanceChip kind="public" detail={`${rows.length} notices`} />}>
      <p className={styles.lead}>Invitation for Bids notices from the World Bank procurement notices, newest first. Bid validity, security and the other clauses are in the bidding documents, which are not in these notices.</p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr><th scope="col">Posted</th><th scope="col">Reference</th><th scope="col">Description</th><th scope="col">Method</th><th scope="col">Bids due</th><th scope="col">Notice</th><th scope="col"><span className="sr-only">Edit</span></th></tr>
          </thead>
          <tbody>
            {shown.map((n) => (
              <tr key={n.id}>
                <td className="mono">{n.posted}</td>
                <td className="mono">{n.reference || <span className={styles.none}>not stated</span>}</td>
                <td>{n.description || <span className={styles.none}>not stated</span>}<span className={styles.none}> · {n.category}, {n.organization}</span></td>
                <td>{n.method}</td>
                <td className="mono">{n.deadline ?? <span className={styles.none}>not stated</span>}</td>
                <td><a href={n.url} target="_blank" rel="noreferrer">{n.id}</a></td>
                <td className={styles.edit}>
                  {n.edited && <Badge>Edited</Badge>}{' '}
                  <Button onClick={() => setEditing(n)} disabled={!allowed} disabledReason={allowed ? undefined : whyDisabled('edit_tender_facts')}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN && <Button onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Button>}
      {editing && (
        <EditRowDialog open onOpenChange={(o) => { if (!o) setEditing(null) }} title="Edit tender notice" description={`${editing.id} · saved as entered by you, the World Bank notice is not changed`}
          fields={TENDER_FIELDS} row={editing as unknown as Record<string, unknown>} pending={save.isPending}
          onSave={(next) => save.mutate(next as unknown as TenderNotice, { onSuccess: () => setEditing(null) })} />
      )}
    </Card>
  )
}
