import { describe, expect, it } from 'vitest'
import type { Project } from './schemas'
import { sectorWord, shortCountry, suggestedPrompts } from './suggestedPrompts'

const project = (id: string, name: string, country: string, practice = 'Transportation') => ({ project_id: id, project_name: name, borrower_country: country, project_global_practice: practice }) as Project
const projects = [
  project('P158504', 'Lao Road Sector Project 2 (LRSP2)', "Lao People's Democratic Republic", 'Info & Communication;Transportation'),
  project('P163730', 'Lao National Road 13 Improvement', "Lao People's Democratic Republic"),
  project('P155522', 'Bihar Rural Roads Project', 'Republic of India'),
  project('P150572', 'KH - Road Asset Management Project II', 'Kingdom of Cambodia'),
  project('P-MOCK-001', 'Mock Road Rehabilitation Project', 'Romania', 'Transport'),
]

describe('suggested prompts', () => {
  it('shortens country names', () => {
    expect(shortCountry("Lao People's Democratic Republic")).toBe('Lao PDR')
    expect(shortCountry('Republic of India')).toBe('India')
    expect(shortCountry('Socialist Republic of Vietnam')).toBe('Vietnam')
    expect(shortCountry('Kingdom of Cambodia')).toBe('Cambodia')
  })

  it('says road when most project names do, and otherwise uses the sector', () => {
    expect(sectorWord(projects.slice(0, 4))).toBe('road')
    expect(sectorWord([project('P1', 'Clinics', 'X', 'Health')])).toBe('health')
    expect(sectorWord([])).toBe('procurement')
  })

  it('offers a request per real country, the one with most projects first, from the stored data', () => {
    const [first, second, third] = suggestedPrompts(projects)
    expect(first!.message).toContain('my own new road project, like the 2 projects in Lao PDR')
    expect(second!.message).toContain('Cambodia')
    expect(third!.message).toContain('Bihar Rural Roads Project in India')
    expect(first!.title).toBe('Road project like Lao PDR')
  })

  it('never builds a country prompt from a mock project', () => {
    const all = suggestedPrompts(projects).map((p) => p.message).join(' ')
    expect(all).not.toContain('Romania')
  })

  it('also offers any other country, the real project list, the data sources and one mock project', () => {
    const titles = suggestedPrompts(projects).map((p) => p.title)
    expect(titles).toEqual(['Road project like Lao PDR', 'Road project like Cambodia', 'Road project like India', 'Any other country', 'Real projects', 'Data sources', 'Try a mock project'])
  })

  it('follows the data: with no real projects there is no country prompt', () => {
    const titles = suggestedPrompts([projects[4]!]).map((p) => p.title)
    expect(titles).toEqual(['Data sources', 'Try a mock project'])
  })
})
