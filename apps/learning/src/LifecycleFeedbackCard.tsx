import { useState } from 'react'
import { lifecycleFeedbackKpis, useLifecycleFeedback, type LifecycleFeedback } from '@pi/data'
import { Badge, Button, Card, Check, ProvenanceChip, TableScroll, X } from '@pi/ui'
import { feedbackFigures } from './Learning'
import styles from './Learning.module.css'

const STATUS_TONE = { pending: 'medium', accepted: 'low', rejected: 'high' } as const

/**
 * The feedback queue of a user's own lifecycle. It starts with a few samples (two decided, one pending) so every state is visible, and the user adds their
 * own feedback below. A decided item shows its status only; a pending one has just Accept and Reject. Kept for this browser session, not sent to the shared queue.
 */
export function LifecycleFeedbackQueue() {
  const { rows, add, decide, reset } = useLifecycleFeedback()
  const [about, setAbout] = useState('')
  const [rating, setRating] = useState<LifecycleFeedback['rating']>('helpful')
  const [note, setNote] = useState('')
  return (
    <Card title="Feedback queue" aside={<span className={styles.row}><Badge tone="medium">Sample</Badge><ProvenanceChip kind="derived" detail={`n=${rows.length}`} /></span>}>
      <p className={styles.sub}>
        The first three rows are samples so you can see how the queue works. Add your own feedback below; it appears as Pending and you can accept or reject it.
        This queue is kept in this browser session and is not the shared Learning queue.
      </p>
      <TableScroll>
        <table className={styles.table}>
          <thead><tr><th>About</th><th>Rating</th><th>Status</th><th>Decision</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.about} {r.sample && <Badge tone="neutral">Sample</Badge>}{r.note && <p className={styles.sub}>Note: {r.note}</p>}</td>
                <td>{r.rating === 'helpful' ? 'Helpful' : 'Not helpful'}</td>
                <td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                <td>
                  {r.status === 'pending' ? (
                    <div className={styles.actions}>
                      <Button variant="success" onClick={() => decide(r.id, 'accepted')}><Check size={16} aria-hidden="true" />Accept</Button>
                      <Button variant="danger" onClick={() => decide(r.id, 'rejected')}><X size={16} aria-hidden="true" />Reject</Button>
                    </div>
                  ) : <span className={styles.sub}>Decided</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); add(about, rating, note); setAbout(''); setNote(''); setRating('helpful') }}>
        <h4>Add your feedback</h4>
        <label>What is it about
          <input value={about} onChange={(e) => setAbout(e.target.value)} placeholder="For example: the suggested bid validity" maxLength={120} required />
        </label>
        <label>Rating
          <select value={rating} onChange={(e) => setRating(e.target.value as LifecycleFeedback['rating'])}>
            <option value="helpful">Helpful</option>
            <option value="not_helpful">Not helpful</option>
          </select>
        </label>
        <label>Note (optional)
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={about.trim() === ''}>Add feedback</Button>
          <Button type="button" onClick={reset}>Reset to samples</Button>
        </div>
      </form>
    </Card>
  )
}

/** The two feedback figures over the lifecycle queue. */
export function LifecycleFeedbackFigures() {
  const rows = useLifecycleFeedback((s) => s.rows)
  const kpis = lifecycleFeedbackKpis(rows)
  return <div className={styles.chatFigures}>{feedbackFigures(kpis)}</div>
}
