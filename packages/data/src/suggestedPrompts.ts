// The prompts offered before the first message, worked out from the projects that are stored: a request per country the real projects are in
// ("a road project like the ones in Lao PDR"), one for any other country, and a few about the data. Nothing here names a project or a country by hand.
import type { Project } from './schemas'
import { projectScope } from './scope'

export interface SuggestedPrompt { title: string; message: string }

/** "Lao People's Democratic Republic" becomes "Lao PDR", "Republic of India" becomes "India". */
export function shortCountry(name: string): string {
  return name.replace(/^(Socialist |Federal Democratic |Democratic )?(Republic|Kingdom) of /, '').replace(/ People's Democratic Republic$/, ' PDR')
}

/** The kind of project the stored ones are: "road" when most names say so, otherwise the sector they are filed under. */
export function sectorWord(projects: Project[]): string {
  if (projects.length === 0) return 'procurement'
  if (projects.filter((p) => /\broads?\b/i.test(p.project_name)).length * 2 > projects.length) return 'road'
  const sector = projects[0]!.project_global_practice.split(';').map((s) => s.trim()).find((s) => !/^info/i.test(s))
  return (sector ?? 'procurement').toLowerCase()
}

const MAX_COUNTRIES = 4

/** Countries with the most real projects first (they give the most to compare with), then alphabetical, so the list is the same every time. */
function countriesByProjects(real: Project[]): { country: string; projects: Project[] }[] {
  const byCountry = new Map<string, Project[]>()
  for (const p of real) byCountry.set(p.borrower_country, [...(byCountry.get(p.borrower_country) ?? []), p])
  return [...byCountry.entries()]
    .map(([country, projects]) => ({ country, projects }))
    .sort((a, b) => b.projects.length - a.projects.length || shortCountry(a.country).localeCompare(shortCountry(b.country)))
}

export function suggestedPrompts(projects: Project[]): SuggestedPrompt[] {
  const real = projects.filter((p) => projectScope(p.project_id) === 'real')
  const mock = projects.filter((p) => projectScope(p.project_id) === 'mock')
  const sector = sectorWord(real)
  const list: SuggestedPrompt[] = []
  for (const { country, projects: here } of countriesByProjects(real).slice(0, MAX_COUNTRIES)) {
    const where = shortCountry(country)
    const like = here.length === 1 ? `${here[0]!.project_name} in ${where}` : `the ${here.length} projects in ${where}`
    list.push({
      title: `${sector[0]!.toUpperCase()}${sector.slice(1)} project like ${where}`,
      message: `Help me with the procurement process of my own new ${sector} project, like ${like}. Suggest my lifecycle from the real projects there.`,
    })
  }
  // One analytical starter, about the first real project of the country that has the most: what its documents show about risk, what is missing, and which other stored projects are comparable.
  const featured = countriesByProjects(real)[0]?.projects[0]
  if (featured) list.push({ title: 'Risks and comparable projects', message: `What are the main risks in ${featured.project_name}, how well does the data support that, and which other stored projects are most comparable to it and why?` })
  if (real.length > 0) {
    list.push({ title: 'Any other country', message: `Help me with the procurement process of my own new ${sector} project in any other country. Suggest my lifecycle from all the real projects and tell me what is missing.` })
    list.push({ title: 'Real projects', message: 'Which real World Bank projects do you have?' })
  }
  list.push({ title: 'Data sources', message: 'What are the data sources?' })
  if (mock.length > 0) list.push({ title: 'Try a mock project', message: `Show me the lifecycle of the mock project ${mock[0]!.project_name}.` })
  return list
}
