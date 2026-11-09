import { feedbackKpis, useFeedback } from '@pi/data'
import { Card, EmptyState } from '@pi/ui'
import { FeedbackQueueCard, feedbackFigures } from './Learning'
import { LifecycleFeedbackFigures, LifecycleFeedbackQueue } from './LifecycleFeedbackCard'
import styles from './Learning.module.css'

export type LearningFeatureId = 'feedback-queue' | 'learning-figures'

/**
 * One learning feature as its own card: the feedback queue where reviewers accept, edit or reject, or the figures worked out from it. The same components
 * the Learning stage is made of, exposed one at a time. With `sample`, the queue is the user's own lifecycle queue (a few labelled samples plus their
 * own feedback) instead of the shared one.
 */
export default function LearningFeature({ feature, projectId, sample = false }: { feature: LearningFeatureId; projectId: string; sample?: boolean }) {
  const feedback = useFeedback()
  if (sample) return feature === 'feedback-queue' ? <LifecycleFeedbackQueue /> : <Card title="Learning figures"><LifecycleFeedbackFigures /></Card>
  if (feature === 'feedback-queue') return <FeedbackQueueCard projectId={projectId} />
  if (feedback.isLoading) return <Card state="loading">{null}</Card>
  const kpis = feedbackKpis(feedback.data ?? [])
  return (
    <Card title="Learning figures">
      {kpis ? <div className={styles.chatFigures}>{feedbackFigures(kpis)}</div> : <EmptyState title="No feedback yet" text="Nothing is estimated in the meantime. Rate any answer with Helpful or Not helpful and the figures appear here." />}
    </Card>
  )
}
