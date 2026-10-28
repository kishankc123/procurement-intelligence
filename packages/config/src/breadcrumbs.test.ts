import { describe, expect, it } from 'vitest'
import { breadcrumbTrail } from './breadcrumbs'

const labels = (path: string, names?: { plan?: string }) => breadcrumbTrail(path, names).map((c) => (c.to ? `${c.label}→${c.to}` : c.label))

describe('breadcrumbTrail', () => {
  it('has no trail on the dashboard', () => {
    expect(breadcrumbTrail('/')).toEqual([])
  })
  it('lists Home and the lifecycle step, with the current page unlinked', () => {
    expect(labels('/monitoring')).toEqual(['Home→/', 'Monitoring'])
    expect(labels('/tender-design')).toEqual(['Home→/', 'Tender design'])
  })
  it('puts a plan under Planning, using its name when known', () => {
    expect(labels('/planning/full-details/PLAN-1', { plan: 'Road works, Lot 3' })).toEqual(['Home→/', 'Planning→/planning', 'Road works, Lot 3'])
    expect(labels('/planning/full-details/PLAN%201')).toEqual(['Home→/', 'Planning→/planning', 'PLAN 1'])
  })
  it('groups the platform tools under a Tools crumb that has no page', () => {
    expect(labels('/suppliers')).toEqual(['Home→/', 'Tools', 'Suppliers'])
    expect(labels('/project-data')).toEqual(['Home→/', 'Tools', 'Project data'])
  })
  it('names the other pages and falls back for unknown ones', () => {
    expect(labels('/project')).toEqual(['Home→/', 'Project overview'])
    expect(labels('/work-with-ai')).toEqual(['Home→/', 'Work with AI'])
    expect(labels('/nope')).toEqual(['Home→/', 'Page not found'])
  })
})
