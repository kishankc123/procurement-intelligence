// A user's own lifecycle has no data yet, so the charts, schedule and queue a user picks for it are shown with a stored project's data as an example.
// The example is the real project with the most supervision reports (the richest one to chart), never a mock project while a real one exists.
import type { Project, SupervisionReport } from './schemas'
import { projectScope } from './scope'

export function pickExampleProject(projects: Project[], reports: Pick<SupervisionReport, 'project_id'>[]): Project | null {
  const counts = new Map<string, number>()
  for (const r of reports) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1)
  const ranked = (list: Project[]) => [...list].filter((p) => (counts.get(p.project_id) ?? 0) > 0)
    .sort((a, b) => (counts.get(b.project_id)! - counts.get(a.project_id)!) || a.project_id.localeCompare(b.project_id))
  const real = ranked(projects.filter((p) => projectScope(p.project_id) === 'real'))
  return real[0] ?? ranked(projects)[0] ?? null
}
