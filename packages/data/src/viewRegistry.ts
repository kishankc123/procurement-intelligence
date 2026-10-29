// The views the chat can draw, in one list. The model asks `findViews` with the user's words and gets back which view matches and how to show it,
// so a question about suppliers shows the suppliers card instead of a paragraph. Adding a stage or tool to `STAGES` / `TOOLS` fails to compile
// until it has an entry here, and a test checks that every entry names a real tool.
import { STAGES, TOOLS, type LifecycleStage, type ToolId } from './assistant'

export interface ViewEntry {
  id: string
  title: string
  /** What the user sees. */
  description: string
  /** The tool that draws it, and the arguments to pass. `projectId` is filled in from the selected project. */
  show: { tool: 'show_lifecycle' | 'show_stage' | 'show_tool' | 'show_map' | 'propose_suppliers' | 'show_my_lifecycle' | 'propose_lifecycle' | 'propose_monitoring' | 'propose_learning' | 'propose_plan' | 'propose_tender_draft'; args: Record<string, string> }
  needsProject: boolean
  /** Words and phrases a user might use for it, including synonyms. Matching ignores case and a trailing s. */
  keywords: string[]
}

const STAGE_VIEWS: Record<LifecycleStage, Omit<ViewEntry, 'id' | 'show' | 'needsProject'>> = {
  planning: { title: 'Planning', description: 'Planned dates, packages, method and category, compared with country reference data.', keywords: ['planning', 'plan', 'plans executed', 'executed plans', 'schedule', 'timeline', 'package', 'procurement plan', 'gantt', 'dates'] },
  'tender-design': { title: 'Tender design', description: 'Tender clauses (duration, bid validity, security, qualification, evaluation method) with a draft to edit.', keywords: ['tender', 'tender design', 'tenders published', 'published tenders', 'draft', 'clause', 'bid validity', 'qualification', 'evaluation method', 'bidding document'] },
  monitoring: { title: 'Monitoring', description: 'Early-warning alerts, ratings, disbursement against time, key dates and milestones.', keywords: ['monitoring', 'monitor', 'evaluation', 'evaluate', 'stats', 'statistics', 'alert', 'early warning', 'risk', 'rating', 'disbursement', 'supervision', 'delay', 'progress'] },
  learning: { title: 'Learning', description: 'Feedback queue, accepted and rejected recommendations, lessons and the update log.', keywords: ['learning', 'learn', 'feedback', 'lesson', 'accepted', 'rejected', 'recommendation', 'update log'] },
}

const TOOL_VIEWS: Record<ToolId, Omit<ViewEntry, 'id' | 'show' | 'needsProject'>> = {
  suppliers: { title: 'Suppliers', description: 'Who won contracts, how much, how often, and from which countries.', keywords: ['supplier', 'vendor', 'contractor', 'awardee', 'winner', 'who won', 'firm', 'company', 'consultant'] },
  'project-data': { title: 'Project data (contracts)', description: 'The contracts of a project with amount, method, category and signing date, and what is entered versus public.', keywords: ['contract', 'award', 'amount', 'signed', 'procurement method', 'category', 'project data', 'amendment', 'works', 'goods'] },
  knowledge: { title: 'Knowledge base', description: 'The data sources and the documents ingested from them, with what each holds.', keywords: ['source', 'knowledge base', 'knowledge', 'document', 'report', 'where does', 'data source', 'registry', 'ingest', 'citation', 'evidence base', 'chunk'] },
  evidence: { title: 'Evidence workbench', description: 'Conflicts between sources and how each was resolved, with the evidence for each side.', keywords: ['conflict', 'conflict between', 'conflicting', 'evidence', 'workbench', 'contradict', 'disagree', 'provenance', 'validation', 'resolve'] },
}

export const VIEWS: ViewEntry[] = [
  { id: 'lifecycle', title: 'Whole lifecycle', description: 'All four stages for one project with what was found in each.', show: { tool: 'show_lifecycle', args: {} }, needsProject: true, keywords: ['lifecycle', 'overview', 'everything', 'all stages', 'summary of the project', 'whole project'] },
  ...STAGES.map((step): ViewEntry => ({ id: step, ...STAGE_VIEWS[step], show: { tool: 'show_stage', args: { step } }, needsProject: true })),
  ...TOOLS.map((tool): ViewEntry => ({ id: tool, ...TOOL_VIEWS[tool], show: { tool: 'show_tool', args: { tool } }, needsProject: tool !== 'knowledge' && tool !== 'evidence' })),
  // The maps come before the tables in ties, so "map of the suppliers" draws the map and "list the suppliers" still draws the table.
  { id: 'suppliers-map', title: 'Supplier map', description: 'A world map of the countries the suppliers come from, for one project or for all.', show: { tool: 'show_map', args: { kind: 'suppliers' } }, needsProject: false, keywords: ['map', 'supplier map', 'where are the supplier', 'where do the supplier', 'supplier location', 'supplier located', 'supplier country', 'supplier countries', 'geography', 'geographic'] },
  { id: 'projects-map', title: 'Project map', description: 'A world map of the countries the projects are in.', show: { tool: 'show_map', args: { kind: 'projects' } }, needsProject: false, keywords: ['project map', 'where are the project', 'where are our project', 'project location', 'project located', 'project countries'] },
  { id: 'lifecycle-proposal', title: 'Proposed lifecycle (estimates)', description: 'Estimated durations, clauses, reporting rhythm and contract sizes for the user\'s own procurement, as medians of similar projects.', show: { tool: 'propose_lifecycle', args: {} }, needsProject: false, keywords: ['propose a lifecycle', 'suggest a lifecycle', 'lifecycle for my', 'how long should', 'how long would', 'estimate', 'typical duration', 'contract be valid', 'bid validity should', 'for my procurement', 'for my project'] },
  { id: 'my-lifecycle', title: 'My lifecycle', description: 'The lifecycle the user is building for their own procurement, with what is still missing.', show: { tool: 'show_my_lifecycle', args: {} }, needsProject: false, keywords: ['my lifecycle', 'my plan so far', 'what do i have', 'what is missing from my', 'what is still missing', 'saved lifecycle'] },
  { id: 'monitoring-options', title: 'Monitoring options', description: 'The charts, schedule and early-warning board the user can add to monitor their own project.', show: { tool: 'propose_monitoring', args: {} }, needsProject: false, keywords: ['how can i monitor', 'how can i evaluate', 'evaluate and monitor', 'monitor my project', 'monitoring options', 'which charts'] },
  { id: 'learning-options', title: 'Learning options', description: 'The feedback queue and learning figures the user can add to their own lifecycle.', show: { tool: 'propose_learning', args: {} }, needsProject: false, keywords: ['how should i add learning', 'add learning', 'learning options', 'feedback queue for my'] },
  { id: 'suppliers-proposal', title: 'Potential suppliers', description: 'Suppliers that won contracts on similar real projects, for the user\'s own procurement.', show: { tool: 'propose_suppliers', args: {} }, needsProject: false, keywords: ['potential suppliers', 'suppliers i could contact', 'who could i contact', 'who might bid', 'suppliers for my', 'suppliers to contact', 'potential bidders'] },
  { id: 'plan-proposal', title: 'Proposed plan', description: 'A timeline for the user\'s own procurement, worked out from stored plans.', show: { tool: 'propose_plan', args: {} }, needsProject: false, keywords: ['propose a plan', 'plan my', 'my procurement', 'when should', 'deadline', 'start date', 'sign by'] },
  { id: 'tender-draft-proposal', title: 'Proposed tender draft', description: 'Suggested clause values and lessons for the user\'s own tender.', show: { tool: 'propose_tender_draft', args: {} }, needsProject: false, keywords: ['draft a tender', 'tender draft', 'my tender', 'clauses for', 'write a tender'] },
]

const stem = (w: string) => w.replace(/(ing|es|s)$/, '')
const tokens = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem)

/**
 * The views that match a request, best first, with a score. A multi-word keyword counts when its words all appear; a single word counts when the
 * request has it (ignoring plural). Nothing matching returns an empty list, which the model must take to mean "there is no view for this".
 */
export function findViews(query: string, limit = 3): { view: ViewEntry; score: number }[] {
  const q = tokens(query)
  const has = (w: string) => q.includes(w) || q.some((t) => t.length >= 4 && w.length >= 4 && (t.startsWith(w) || w.startsWith(t)))
  return VIEWS
    .map((view) => ({ view, score: view.keywords.reduce((n, k) => { const ws = tokens(k); return n + (ws.length > 0 && ws.every(has) ? ws.length + 1 : 0) }, 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
