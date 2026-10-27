import { useCurrentUser, useFeedback, useSubmitFeedback } from '@pi/data'
import { Button } from '@pi/ui'

/** Helpful / Not helpful. Writes to `feedback`; Learning reads the same collection. */
export function FeedbackWidget({ targetId }: { targetId: string }) {
  const { role } = useCurrentUser()
  const submit = useSubmitFeedback()
  const existing = (useFeedback().data ?? []).filter((f) => f.target_id === targetId && f.role === role)
  const last = existing[existing.length - 1]
  const send = (rating: 'helpful' | 'not_helpful') => submit.mutate({ target_id: targetId, rating, reason: '' })
  return (
    <span role="group" aria-label="Feedback">
      <Button onClick={() => send('helpful')} disabled={submit.isPending}>Helpful</Button>{' '}
      <Button onClick={() => send('not_helpful')} disabled={submit.isPending}>Not helpful</Button>
      {last && <span className="mono" role="status"> Sent: {last.rating.replace('_', ' ')}</span>}
    </span>
  )
}
