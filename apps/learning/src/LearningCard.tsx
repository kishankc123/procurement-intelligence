import { feedbackKpis, SAMPLE_FEEDBACK, useFeedback, useRecommendations, type Feedback } from '@pi/data'
import { Badge, Card, EmptyState, ProvenanceChip, TableScroll } from '@pi/ui'
import { FeedbackQueueCard, feedbackFigures } from './Learning'
import styles from './Learning.module.css'

/** Whether a piece of feedback is about this project: it names one of its recommendations, or one of the cards the assistant drew for it (the id ends with the project id). */
export function isAboutProject(f: Feedback, projectId: string, recommendationIds: ReadonlySet<string>): boolean {
  return recommendationIds.has(f.target_id) || f.target_id.endsWith(`-${projectId}`)
}

/** What a feedback row looks like, for a project that has none yet. Rows are examples, not real feedback, and nothing here can be pressed. */
function SampleFeedback() {
  return (
    <Card title="What feedback looks like" aside={<Badge tone="neutral">Sample</Badge>}>
      <p className={styles.sub}>These rows are examples only, to show how feedback would appear once someone rates an answer or card with Helpful or Not helpful. They are not about this project.</p>
      <TableScroll>
        <table className={styles.table}>
          <thead><tr><th>About</th><th>Rating</th><th>Status</th></tr></thead>
          <tbody>
            {SAMPLE_FEEDBACK.map((r) => (
              <tr key={r.id}>
                <td>{r.about} <Badge tone="neutral">Sample</Badge>{r.note && <p className={styles.sub}>Note: {r.note}</p>}</td>
                <td>{r.rating === 'helpful' ? 'Helpful' : 'Not helpful'}</td>
                <td><Badge tone={r.status === 'accepted' ? 'low' : r.status === 'rejected' ? 'high' : 'medium'}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  )
}

/**
 * The Learning stage as a card for the chat: what users have said about the assistant's answers and recommendations for THIS project, how much of it
 * reviewers accepted, and the queue where reviewers decide. A project nobody has rated yet (every real project to begin with) says so and shows a few
 * labelled sample rows instead of other projects' feedback. The Learning page still shows the whole queue.
 */
export default function LearningCard({ projectId }: { projectId: string }) {
  const feedback = useFeedback()
  const recs = useRecommendations(projectId)
  if (feedback.isLoading || recs.isLoading) return <Card state="loading">{null}</Card>
  const recIds = new Set((recs.data ?? []).map((r) => r.id))
  const only = (f: Feedback) => isAboutProject(f, projectId, recIds)
  const rows = (feedback.data ?? []).filter(only)
  const kpis = feedbackKpis(rows)
  return (
    <div className={styles.chatCard}>
      <p className={styles.chatSummary}>
        {kpis
          ? <><strong>{kpis.total} pieces of feedback</strong> so far, {kpis.reviewed} reviewed and {kpis.accepted} accepted by reviewers. Rate any answer or card with Helpful or Not helpful and it lands in this queue.</>
          : <><strong>No feedback has been received for this project yet.</strong> Rate any answer or card with Helpful or Not helpful and it will appear here for a reviewer.</>}
        {' '}<ProvenanceChip kind="derived" detail={`n=${rows.length}`} />
      </p>
      {kpis
        ? <><div className={styles.chatFigures}>{feedbackFigures(kpis)}</div><FeedbackQueueCard projectId={projectId} only={only} /></>
        : <><EmptyState title="No feedback yet" text="Nothing is estimated in the meantime." /><SampleFeedback /></>}
    </div>
  )
}
