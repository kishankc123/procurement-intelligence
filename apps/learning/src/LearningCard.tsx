import { feedbackKpis, useFeedback } from '@pi/data'
import { Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { FeedbackQueueCard, feedbackFigures } from './Learning'
import styles from './Learning.module.css'

/**
 * The Learning stage as a card for the chat: what users have said about the assistant's answers and recommendations,
 * how much of it reviewers accepted, and the queue where reviewers decide. The same data and decisions as the Learning page.
 */
export default function LearningCard({ projectId }: { projectId: string }) {
  const feedback = useFeedback()
  if (feedback.isLoading) return <Card state="loading">{null}</Card>
  const rows = feedback.data ?? []
  const kpis = feedbackKpis(rows)
  return (
    <div className={styles.chatCard}>
      <p className={styles.chatSummary}>
        {kpis
          ? <><strong>{kpis.total} pieces of feedback</strong> so far, {kpis.reviewed} reviewed and {kpis.accepted} accepted by reviewers. Rate any answer or card with Helpful or Not helpful and it lands in this queue.</>
          : <>No feedback yet. Rate any answer or card with Helpful or Not helpful and it will appear here for a reviewer.</>}
        {' '}<ProvenanceChip kind="derived" detail={`n=${rows.length}`} />
      </p>
      {kpis ? <div className={styles.chatFigures}>{feedbackFigures(kpis)}</div> : <EmptyState title="No feedback yet" text="Nothing is estimated in the meantime." />}
      <FeedbackQueueCard projectId={projectId} />
    </div>
  )
}
