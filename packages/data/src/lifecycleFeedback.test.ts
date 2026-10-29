import { beforeEach, describe, expect, it } from 'vitest'
import { SAMPLE_FEEDBACK, lifecycleFeedbackKpis, useLifecycleFeedback } from './lifecycleFeedback'

describe('lifecycle feedback queue', () => {
  beforeEach(() => { sessionStorage.clear(); useLifecycleFeedback.getState().reset() })

  it('starts with decided and pending samples', () => {
    const { rows } = useLifecycleFeedback.getState()
    expect(rows).toEqual(SAMPLE_FEEDBACK)
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(['accepted', 'rejected', 'pending']))
    expect(rows.every((r) => r.sample)).toBe(true)
  })

  it('adds the user\'s feedback as pending, and only a pending one can be decided', () => {
    const { add, decide } = useLifecycleFeedback.getState()
    add('  Suggested bid validity ', 'not_helpful', 'too short')
    const added = useLifecycleFeedback.getState().rows.at(-1)!
    expect(added).toMatchObject({ about: 'Suggested bid validity', status: 'pending', sample: false })
    decide(added.id, 'rejected')
    decide(added.id, 'accepted')
    expect(useLifecycleFeedback.getState().rows.at(-1)!.status).toBe('rejected')
  })

  it('counts only decided rows as reviewed, and is null when empty', () => {
    expect(lifecycleFeedbackKpis(SAMPLE_FEEDBACK)).toEqual({ total: 3, reviewed: 2, accepted: 1, rejected: 1 })
    expect(lifecycleFeedbackKpis([])).toBeNull()
  })
})
