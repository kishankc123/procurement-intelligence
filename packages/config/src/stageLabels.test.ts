import { describe, expect, it } from 'vitest'
import { LIFECYCLE_STEPS, PAST_STAGE_LABEL } from './index'

describe('stage names', () => {
  it('names the stages of a stored project for what happened, and the user\'s own lifecycle for what is planned', () => {
    expect(LIFECYCLE_STEPS.map((s) => PAST_STAGE_LABEL[s.id])).toEqual(['Plans executed', 'Tenders published', 'Evaluation', 'Feedback'])
    expect(LIFECYCLE_STEPS.map((s) => s.label)).toEqual(['Planning', 'Tender design', 'Monitoring', 'Learning'])
  })
})
