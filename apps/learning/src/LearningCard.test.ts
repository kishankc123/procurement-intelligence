import { describe, expect, it } from 'vitest'
import type { Feedback } from '@pi/data'
import { isAboutProject } from './LearningCard'

const f = (target_id: string) => ({ id: 'x', target_id, rating: 'helpful', reason: '', role: 'planner', status: 'new', created_at: '2026-01-01T00:00:00Z' }) as Feedback

describe('isAboutProject', () => {
  it('matches a recommendation of the project and a card drawn for it', () => {
    expect(isAboutProject(f('REC-MOCK-1'), 'P-MOCK-001', new Set(['REC-MOCK-1']))).toBe(true)
    expect(isAboutProject(f('AI-LAYER-chatplanning-P158504'), 'P158504', new Set())).toBe(true)
  })
  it('does not show another project\'s feedback', () => {
    expect(isAboutProject(f('AI-LAYER-spec-P-MOCK-001'), 'P158504', new Set())).toBe(false)
    expect(isAboutProject(f('REC-MOCK-1'), 'P158504', new Set())).toBe(false)
    expect(isAboutProject(f('AI-LAYER-chatplanning-P1585040'), 'P158504', new Set())).toBe(false)
  })
})
