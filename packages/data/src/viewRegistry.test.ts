import { describe, expect, it } from 'vitest'
import { STAGES, TOOLS } from './assistant'
import { findViews, VIEWS } from './viewRegistry'

const best = (q: string) => findViews(q)[0]?.view.id

describe('the view registry', () => {
  it('has a view for every stage and every tool the chat can draw', () => {
    for (const s of STAGES) expect(VIEWS.some((v) => v.id === s && v.show.tool === 'show_stage' && v.show.args.step === s)).toBe(true)
    for (const t of TOOLS) expect(VIEWS.some((v) => v.id === t && v.show.tool === 'show_tool' && v.show.args.tool === t)).toBe(true)
    expect(new Set(VIEWS.map((v) => v.id)).size).toBe(VIEWS.length)
  })

  it('matches what people say, including synonyms and plurals', () => {
    expect(best('Who are the biggest suppliers?')).toBe('suppliers')
    expect(best('which vendors won the most')).toBe('suppliers')
    expect(best('show me the contractor list')).toBe('suppliers')
    expect(best('List the contracts signed in 2020')).toBe('project-data')
    expect(best('What are the data sources?')).toBe('knowledge')
    expect(best('which documents did you ingest')).toBe('knowledge')
    expect(best('are there conflicts between the sources')).toBe('evidence')
    expect(best('any early warning alerts?')).toBe('monitoring')
    expect(best('what is the bid validity clause')).toBe('tender-design')
    expect(best('show the project timeline')).toBe('planning')
    expect(best('give me an overview of everything')).toBe('lifecycle')
    expect(best('propose a lifecycle for my road project')).toBe('lifecycle-proposal')
    expect(best('how long should the bidding take')).toBe('lifecycle-proposal')
    expect(best('How can I evaluate and monitor my project?')).toBe('monitoring-options')
    expect(best('how should I add learning to my project')).toBe('learning-options')
    expect(best('what is still missing from my lifecycle')).toBe('my-lifecycle')
    expect(best('compare these two projects')).toBe('compare-projects')
    expect(best('which project has more suppliers')).toBe('compare-projects')
    expect(best('show a bar chart of project prices')).toBe('compare-projects')
    // A map is a different view from the table, even for the same data.
    expect(best('Show me a map of where the suppliers on the Lao Road Sector Project 2 are')).toBe('suppliers-map')
    expect(best('where are our suppliers located?')).toBe('suppliers-map')
    expect(best('show a map of our projects')).toBe('projects-map')
    expect(best('where are the projects')).toBe('projects-map')
    expect(findViews('list the suppliers')[0]?.view.id).toBe('suppliers')
    // Potential suppliers for the user's own procurement are not the suppliers of one stored project.
    expect(findViews('What are the potential suppliers I could contact?')[0]?.view.id).toBe('suppliers-proposal')
    expect(findViews('who could I contact for a road project like this')[0]?.view.id).toBe('suppliers-proposal')
    // The names a stored project's stages go by.
    expect(best('show plans executed for the Lao project')).toBe('planning')
    expect(best('show tenders published for the Lao project')).toBe('tender-design')
    expect(best('show evaluation for the Lao project')).toBe('monitoring')
    expect(best('show the evals and stats of the Lao project')).toBe('monitoring')
    expect(best('show feedback for the Lao project')).toBe('learning')
  })

  it('returns nothing, not a guess, when no view fits', () => {
    expect(findViews('what is the weather in Vientiane')).toEqual([])
    expect(findViews('')).toEqual([])
  })
})
