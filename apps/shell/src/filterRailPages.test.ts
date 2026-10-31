import { describe, expect, it } from 'vitest'
import { hasFilterRail } from './filterRailPages'

describe('hasFilterRail', () => {
  it('is off on the home page, the assistant page and the chat', () => {
    for (const p of ['/', '/assistant', '/chat', '/chat/', '/assistant/']) expect(hasFilterRail(p)).toBe(false)
  })
  it('is on for the dashboard pages', () => {
    for (const p of ['/planning', '/planning/full-details/PLAN-1', '/tender-design', '/monitoring', '/learning', '/knowledge', '/evidence', '/project-data', '/work-with-ai', '/suppliers', '/project']) expect(hasFilterRail(p)).toBe(true)
  })
})
