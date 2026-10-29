import { z } from 'zod'
import type { Amendment, Chunk, CompletionReport, Conflict, Contract, ContractMilestone, Doc, Enrichment, Feedback, Plan, PlanPackage, Project, TenderNotice, Source, SupervisionReport, TenderDraft } from './schemas'

/**
 * The assistant's contract with the interface: a request goes to the server, a reply comes back.
 * The reply carries what the server did (steps, imitating the services behind it) and a dossier of what it found.
 * The server is rule-based over the mock data. Nothing here calls a model, so every reply says it is simulated.
 */
export const AssistantRequest = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })).max(40).optional(),
  /** The project the conversation is already about, so "show planning" needs no project name. */
  projectId: z.string().optional(),
})
export type AssistantRequest = z.infer<typeof AssistantRequest>

export const AssistantStep = z.object({
  id: z.string(),
  /** The service that would answer in a full system. */
  service: z.string(),
  label: z.string(),
  detail: z.string(),
  records: z.number(),
})
export type AssistantStep = z.infer<typeof AssistantStep>

export const Dossier = z.object({
  projectId: z.string(),
  projectName: z.string(),
  country: z.string(),
  sector: z.string(),
  counts: z.object({
    contracts: z.number(), plans: z.number(), tenderDrafts: z.number(), supervisionReports: z.number(), completionReports: z.number(),
    documents: z.number(), chunks: z.number(), amendments: z.number(), milestones: z.number(),
  }),
})
export type Dossier = z.infer<typeof Dossier>

/** The four lifecycle stages, as the donut and the blocks name them. Kept in step with LIFECYCLE_STEPS and its labels (tested). */
export const STAGES = ['planning', 'tender-design', 'monitoring', 'learning'] as const
export type LifecycleStage = (typeof STAGES)[number]

/**
 * What the chat should draw under the reply. A block carries ids, never figures: each card reads its numbers from the same
 * data hooks as the rest of the app, so an edit shows everywhere. New card types are added here as they are built.
 */
/** The tools the user can ask for by name: the suppliers, the contracts, where the data comes from, and the evidence workbench. */
export const TOOLS = ['suppliers', 'project-data', 'knowledge', 'evidence'] as const
export type ToolId = (typeof TOOLS)[number]

export const Block = z.discriminatedUnion('type', [
  /** Everything was gathered: text, the big donut and what was found per stage. */
  z.object({ type: z.literal('ready'), projectId: z.string() }),
  /** The whole lifecycle as the big donut. */
  z.object({ type: z.literal('lifecycle'), projectId: z.string() }),
  /** One stage, headed by the small donut. */
  z.object({ type: z.literal('stage'), step: z.enum(STAGES), projectId: z.string() }),
  /** One tool. The knowledge base and the evidence workbench also make sense without a project, so `projectId` may be null. */
  z.object({ type: z.literal('tool'), tool: z.enum(TOOLS), projectId: z.string().nullable() }),
])
export type Block = z.infer<typeof Block>

export const AssistantReply = z.object({
  reply: z.string(),
  simulated: z.literal(true),
  steps: z.array(AssistantStep),
  /** Projects the user can pick when the request did not name exactly one. `prompt` is what a click sends, so it repeats the request. */
  options: z.array(z.object({ projectId: z.string(), label: z.string(), prompt: z.string() })),
  dossier: Dossier.nullable(),
  /** The project this reply is about, so the next message can leave the name out. */
  projectId: z.string().nullable(),
  blocks: z.array(Block),
  /** What to offer next, as prompts the chat can send. */
  suggestions: z.array(z.string()),
})
export type AssistantReply = z.infer<typeof AssistantReply>

/** The slice of db.json the assistant reads. */
export interface AssistantDb {
  projects: Project[]
  contracts: Contract[]
  plans: Plan[]
  tender_drafts: TenderDraft[]
  plan_packages: PlanPackage[]
  tender_notices: TenderNotice[]
  supervision_reports: SupervisionReport[]
  completion_reports: CompletionReport[]
  documents: Doc[]
  chunks: Chunk[]
  amendments: Amendment[]
  contract_milestones: ContractMilestone[]
  feedback: Feedback[]
  sources: Source[]
  enrichments: Enrichment[]
  conflicts: Conflict[]
  meta?: { dataset_label?: string }
}

const COLLECTIONS = ['projects', 'contracts', 'plans', 'tender_drafts', 'plan_packages', 'tender_notices', 'supervision_reports', 'completion_reports', 'documents', 'chunks', 'amendments', 'contract_milestones', 'feedback', 'sources', 'enrichments', 'conflicts'] as const

/** A missing collection is an empty one, so a half-filled data file gives a plain answer instead of a crash. */
export function withDefaults(raw: Partial<AssistantDb> | null | undefined): AssistantDb {
  const source = (raw ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = { meta: source.meta }
  for (const k of COLLECTIONS) out[k] = Array.isArray(source[k]) ? source[k] : []
  return out as unknown as AssistantDb
}

export type Resolved =
  | { kind: 'project'; project: Project }
  | { kind: 'default'; project: Project }
  | { kind: 'ambiguous'; projects: Project[] }
  | { kind: 'none' }

const STOP = new Set([
  'help', 'with', 'the', 'and', 'for', 'one', 'project', 'projects', 'mock', 'please', 'can', 'you', 'want', 'work', 'about', 'give', 'info', 'show',
  'need', 'get', 'this', 'that', 'from', 'some', 'any', 'pick', 'choose', 'random', 'session', 'sessions', 'procurement', 'solution', 'build',
  'plan', 'planning', 'timeline', 'tender', 'design', 'draft', 'monitoring', 'learning', 'feedback', 'stage', 'lifecycle', 'entire', 'whole', 'full',
  'alert', 'alerts', 'warning', 'schedule',
])
const words = (s: string) => s.toLowerCase().match(/[a-z0-9-]+/g) ?? []
const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)

/** Which project does the message mean? An id wins; then the words it shares with a project's name, country and sector. */
export function resolveProject(message: string, db: Pick<AssistantDb, 'projects' | 'contracts'>): Resolved {
  const text = message.toLowerCase()
  const byId = db.projects.find((p) => text.includes(p.project_id.toLowerCase()))
  if (byId) return { kind: 'project', project: byId }

  const asked = words(message).map(stem).filter((w) => w.length >= 3 && !STOP.has(w))
  const scored = db.projects.map((p) => {
    const hay = new Set(words(`${p.project_name} ${p.borrower_country} ${p.project_global_practice}`).map(stem))
    return { p, score: asked.filter((w) => hay.has(w)).length }
  })
  const top = Math.max(0, ...scored.map((s) => s.score))
  if (top > 0) {
    const best = scored.filter((s) => s.score === top).map((s) => s.p)
    return best.length === 1 && best[0] ? { kind: 'project', project: best[0] } : { kind: 'ambiguous', projects: best }
  }

  const anyOne = /\b(one of|any|some|whichever|random|pick|choose|surprise|a project|your choice)\b/.test(text) && /project|mock|session/.test(text)
  if (anyOne) {
    // No project named: take the one with the most contracts, and say so in the reply. "Mock" limits the choice to the mock projects.
    const counts = new Map<string, number>()
    for (const c of db.contracts) counts.set(c.project_id, (counts.get(c.project_id) ?? 0) + 1)
    const pool = /\bmock\b/.test(text) ? db.projects.filter((p) => /mock/i.test(p.project_id) || /^mock/i.test(p.project_name)) : db.projects
    const fullest = [...(pool.length > 0 ? pool : db.projects)].sort((a, b) => (counts.get(b.project_id) ?? 0) - (counts.get(a.project_id) ?? 0))[0]
    if (fullest) return { kind: 'default', project: fullest }
  }
  return { kind: 'none' }
}

const usd = (n: number) => `USD ${Math.round(n).toLocaleString('en-US')}`

/** Everything the services would return for one project, as counts, plus the steps that produced them. */
export function buildDossier(db: AssistantDb, project: Project): { dossier: Dossier; steps: AssistantStep[] } {
  const pid = project.project_id
  const contracts = db.contracts.filter((c) => c.project_id === pid)
  const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
  const plans = db.plans.filter((p) => p.project_id === pid)
  const drafts = db.tender_drafts.filter((d) => d.project_id === pid)
  const reports = db.supervision_reports.filter((r) => r.project_id === pid)
  const docs = db.documents.filter((d) => d.project_id === pid || d.project_id === 'GENERAL')
  const docIds = new Set(docs.map((d) => d.doc_id))
  const chunks = db.chunks.filter((c) => docIds.has(c.doc_id))
  const amendments = db.amendments.filter((a) => refs.has(a.contract_ref))
  const milestones = db.contract_milestones.filter((m) => refs.has(m.contract_ref))
  const completions = db.completion_reports.length
  const committed = contracts.reduce((s, c) => s + c.supplier_contract_amount_usd, 0)

  const steps: AssistantStep[] = [
    { id: 'projects', service: 'Projects service', label: 'Looked up the project', detail: `${project.project_name}, ${project.borrower_country}, ${project.project_global_practice}.`, records: 1 },
    { id: 'contracts', service: 'Contract awards service', label: 'Fetched its contract awards', detail: `${contracts.length} contracts, ${usd(committed)} committed.`, records: contracts.length },
    { id: 'plans', service: 'Procurement plans service', label: 'Fetched its procurement plans and tender draft', detail: `${plans.length} plans and ${drafts.length} tender ${drafts.length === 1 ? 'draft' : 'drafts'}.`, records: plans.length + drafts.length },
    { id: 'supervision', service: 'Supervision reports service', label: 'Fetched its supervision reports', detail: `${reports.length} reports with ratings, risk and disbursement.`, records: reports.length },
    { id: 'contract-management', service: 'Contract management service', label: 'Fetched amendments and milestones', detail: `${amendments.length} amendments and ${milestones.length} milestones on its contracts.`, records: amendments.length + milestones.length },
    { id: 'documents', service: 'Document store', label: 'Fetched its documents and text chunks', detail: `${docs.length} documents split into ${chunks.length} chunks.`, records: docs.length + chunks.length },
    { id: 'evaluations', service: 'Evaluations service', label: 'Fetched completion reports of similar projects', detail: `${completions} completion reports with lessons learned.`, records: completions },
  ]
  const dossier: Dossier = {
    projectId: pid, projectName: project.project_name, country: project.borrower_country, sector: project.project_global_practice,
    counts: {
      contracts: contracts.length, plans: plans.length, tenderDrafts: drafts.length, supervisionReports: reports.length, completionReports: completions,
      documents: docs.length, chunks: chunks.length, amendments: amendments.length, milestones: milestones.length,
    },
  }
  return { dossier, steps }
}

export type Intent = 'lifecycle' | LifecycleStage | ToolId

// Plain labels, not imported from @pi/config: the Vercel function loads this file on its own, without the workspace packages. A test keeps them equal to the donut's.
export const STAGE_LABEL: Record<LifecycleStage, string> = { planning: 'Planning', 'tender-design': 'Tender design', monitoring: 'Monitoring', learning: 'Learning' }
const TOOL_PHRASE: Record<ToolId, string> = { suppliers: 'the suppliers', 'project-data': 'the project data', knowledge: 'the knowledge base', evidence: 'the evidence workbench' }

/**
 * What does the user want to see? The whole lifecycle comes first ("the entire timeline"), then the tools (evidence, knowledge,
 * suppliers, project data), then a single stage. Rule-based on purpose, so it is easy to read and to test. Returns null when nothing matches.
 */
export function detectIntent(message: string): Intent | null {
  const t = message.toLowerCase()
  if (/\b(entire|whole|full|complete|all)\b.{0,12}\b(timeline|lifecycle|stages|process|journey)\b|\blifecycle\b|\ball (the )?(stages|steps)\b/.test(t)) return 'lifecycle'
  if (/\bevidence|\bconflict|\bworkbench|\breconcil/.test(t)) return 'evidence'
  if (/\bknowledge|\bdocuments?\b|\bsources?\b|\bregistry|where.{0,24}\bdata\b|\bdata (comes|come)\b/.test(t)) return 'knowledge'
  if (/\bsupplier|\bvendor|\bcontractor/.test(t)) return 'suppliers'
  if (/\bproject data|\bcontracts?\b|\bcontract awards|\bentered data|\btender facts|\bdata entry/.test(t)) return 'project-data'
  if (/\btender|\bdraft|\bclause|\bspecification|bid validity/.test(t)) return 'tender-design'
  if (/\bmonitor|\balert|\bwarning|\bschedule|\bdisburs|\bexecution|\bsupervision/.test(t)) return 'monitoring'
  if (/\blearn|\bfeedback|\blesson/.test(t)) return 'learning'
  if (/\bplan|\btimeline|\bpackage/.test(t)) return 'planning'
  return null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** One suggestive sentence for a stage, from the records the services returned. Zero is said plainly. */
function stageIntro(db: AssistantDb, project: Project, step: LifecycleStage): string {
  const name = project.project_name
  if (step === 'planning') {
    const plans = db.plans.filter((p) => p.project_id === project.project_id)
    const rows = db.plan_packages.filter((r) => r.project_id === project.project_id)
    if (plans.length === 0 && rows.length > 0) return `${name} has no saved plan, but its World Bank procurement plan of ${rows[0]!.plan_date} is on record: ${plural(rows.length, 'row')} are shown below as the document writes them.`
    if (plans.length === 0) return `I found no procurement plans for ${name}. Plans are entered by a planner, so there is nothing to show yet.`
    return `I found ${plural(plans.length, 'procurement plan')} for ${name}. The timeline shows the four tender stages of the selected plan; pick another plan in the table to compare, or switch stage with the donut.`
  }
  if (step === 'tender-design') {
    const draft = db.tender_drafts.find((d) => d.project_id === project.project_id)
    return draft
      ? `A tender draft is on record for ${name}. Below are its clauses as entered.`
      : (() => {
          const tenders = db.tender_notices.filter((t) => t.project_id === project.project_id).length
          return `There is no tender draft on record for ${name}, and nothing is made up for an existing project.${tenders > 0 ? ` It did publish ${plural(tenders, 'tender')}, listed below.` : ''} Ask me to suggest clauses for your own procurement if that is what you need.`
        })()
  }
  if (step === 'monitoring') {
    const reports = db.supervision_reports.filter((r) => r.project_id === project.project_id)
    if (reports.length === 0) return `There are no supervision reports for ${name}, so I cannot show how it is performing yet.`
    return `${name} has ${plural(reports.length, 'supervision report')}. Below are its disbursement against time, its schedule and the warnings I found, urgent ones first.`
  }
  const total = db.feedback.length
  if (total === 0) return `Nobody has rated an answer yet, so there is nothing to learn from. Rate anything I show with Helpful or Not helpful and it will appear here for a reviewer.`
  const accepted = db.feedback.filter((f) => f.status === 'accepted').length
  const reviewed = db.feedback.filter((f) => f.status !== 'new').length
  return `Users have left ${plural(total, 'piece')} of feedback so far: ${reviewed} reviewed and ${accepted} accepted. Reviewers decide on each one below, and every decision is logged.`
}

/** One sentence for a tool, from the records behind it. Missing data is said plainly, never filled in. */
function toolIntro(db: AssistantDb, project: Project | null, tool: ToolId): string {
  const pid = project?.project_id
  const name = project?.project_name ?? 'the demo'
  if (tool === 'suppliers' && project) {
    const contracts = db.contracts.filter((c) => c.project_id === pid)
    if (contracts.length === 0) return `${name} has no contracts on record, so there are no suppliers to list.`
    const suppliers = new Set(contracts.map((c) => c.supplier_id)).size
    return `I found ${plural(suppliers, 'supplier')} on the ${plural(contracts.length, 'contract')} of ${name}, ${usd(contracts.reduce((n, c) => n + c.supplier_contract_amount_usd, 0))} committed in all. Pick one to see its history across projects; a verdict is only given when there are enough contracts.`
  }
  if (tool === 'project-data' && project) {
    const contracts = db.contracts.filter((c) => c.project_id === pid)
    if (contracts.length === 0) return `${name} has no contracts on record yet, so there is no project data to show.`
    const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
    const covered = new Set(db.enrichments.filter((e) => e.status === 'approved' && refs.has(e.contract_ref)).map((e) => e.contract_ref)).size
    return `${name} has ${plural(contracts.length, 'contract')}. The public columns come from contract awards; tender facts are entered by your team and approved by a reviewer. ${covered} of ${contracts.length} contracts have approved entries, and the rest show as Missing.`
  }
  if (tool === 'knowledge') {
    const label = db.meta?.dataset_label
    const sources = db.sources
    const docs = project ? db.documents.filter((d) => d.project_id === pid || d.project_id === 'GENERAL') : db.documents
    const where = sources.length === 0
      ? 'No sources are registered, so I cannot say where the data comes from.'
      : `My records come from ${plural(sources.length, 'registered source')}: ${sources.map((s) => s.name).slice(0, 4).join(', ')}${sources.length > 4 ? ` and ${sources.length - 4} more` : ''}.${label ? ` The dataset is labelled: ${label}.` : ''} Nothing is fetched live.`
    const what = docs.length === 0 ? ' There are no documents to show yet.' : ` ${project ? `${name} has` : 'There are'} ${plural(docs.length, 'document')}, ${docs.filter((d) => d.parse_status === 'parsed').length} of them parsed into text.`
    return `${where}${what}`
  }
  // evidence
  const conflicts = db.conflicts.filter((c) => !pid || c.project_id === pid)
  if (conflicts.length === 0) return `No conflicts are recorded${project ? ` for ${name}` : ''}, so there is nothing to resolve. When two sources disagree it will appear here with the rule applied.`
  const open = conflicts.filter((c) => c.status === 'open').length
  return `I found ${plural(conflicts.length, 'conflict')}${project ? ` for ${name}` : ''}, ${open} still open. Each shows both sources, the rule applied and the decision.`
}

/** Prompts to offer next. With a project every stage and tool is offered except the one just shown. */
const FOLLOW_UPS = ['Show the plan timeline', 'Suggest a tender draft', 'Show monitoring', 'Show learning', 'List the suppliers', 'Show the project data', 'What is the data source?', 'Show the knowledge base', 'Show the evidence workbench']
function suggestionsFor(db: AssistantDb, project: Project | null, shown: Intent | null): string[] {
  if (!project) return ['Help me with one of the mock projects', ...db.projects.map((p) => `Help me with ${p.project_name}`), ...(shown === 'knowledge' ? [] : ['What is the data source?'])]
  return FOLLOW_UPS.filter((p) => !shown || detectIntent(p) !== shown)
}

const understood = (detail: string): AssistantStep => ({ id: 'understand', service: 'Assistant', label: 'Understood the request', detail, records: 0 })

/**
 * The assistant: understand the message, pick a project and what to show, and answer with what the services returned. Pure, so it can be tested.
 * `contextProjectId` is the project the conversation is already about: it is used when the message names none.
 * Missing collections count as empty, so a half-filled data file answers plainly instead of throwing.
 */
export function answer(rawDb: Partial<AssistantDb>, message: string, contextProjectId?: string): AssistantReply {
  const db = withDefaults(rawDb)
  const intent = detectIntent(message)
  const resolved = resolveProject(message, db)
  const known = db.projects.find((p) => p.project_id === contextProjectId)
  const phrase = (i: Intent) => (i === 'lifecycle' ? 'the whole lifecycle' : i in TOOL_PHRASE ? TOOL_PHRASE[i as ToolId] : STAGE_LABEL[i as LifecycleStage].toLowerCase())
  const asks = (p: Project) => (intent ? `Show ${phrase(intent)} for ${p.project_name}` : `Help me with ${p.project_name}`)
  const optionsFor = (projects: Project[]) => projects.map((p) => ({ projectId: p.project_id, label: p.project_name, prompt: asks(p) }))
  const base = { simulated: true as const, steps: [] as AssistantStep[], dossier: null, projectId: null as string | null, blocks: [] as Block[], options: [] as AssistantReply['options'] }

  // A project named in the message wins, then "one of the mock projects", then the project the conversation is about.
  const project = resolved.kind === 'project' || resolved.kind === 'default' ? resolved.project : resolved.kind === 'none' ? known : undefined
  const picked = resolved.kind === 'default' && project ? ` No project was named, so I took ${project.project_name}.` : ''

  // The knowledge base and the evidence workbench work without a project; every other request needs one.
  const global = intent === 'knowledge' || intent === 'evidence'
  if (intent && (project || (global && resolved.kind !== 'ambiguous'))) {
    if (intent === 'lifecycle' && project) {
      return { ...base, reply: `Here is the whole lifecycle for ${project.project_name}.${picked} Pick a stage to open it.`, steps: [understood(`Showing the lifecycle of ${project.project_name} (${project.project_id}).`)], projectId: project.project_id, blocks: [{ type: 'lifecycle', projectId: project.project_id }], suggestions: suggestionsFor(db, project, intent) }
    }
    if ((intent === 'suppliers' || intent === 'project-data' || global) && (TOOLS as readonly string[]).includes(intent)) {
      const tool = intent as ToolId
      return {
        ...base, reply: `${toolIntro(db, project ?? null, tool)}${picked}`,
        steps: [understood(`Opening ${TOOL_PHRASE[tool]}${project ? ` for ${project.project_name} (${project.project_id})` : ''}.`)],
        projectId: project?.project_id ?? null, blocks: [{ type: 'tool', tool, projectId: project?.project_id ?? null }], suggestions: suggestionsFor(db, project ?? null, intent),
      }
    }
    if (project && (STAGES as readonly string[]).includes(intent)) {
      const step = intent as LifecycleStage
      return { ...base, reply: `${stageIntro(db, project, step)}${picked}`, steps: [understood(`Opening ${STAGE_LABEL[step]} for ${project.project_name} (${project.project_id}).`)], projectId: project.project_id, blocks: [{ type: 'stage', step, projectId: project.project_id }], suggestions: suggestionsFor(db, project, intent) }
    }
  }

  if ((resolved.kind === 'project' || resolved.kind === 'default') && !intent) {
    const { project: named } = resolved
    const { dossier, steps } = buildDossier(db, named)
    return {
      ...base,
      reply: `${resolved.kind === 'default' ? `You did not name a project, so I took ${named.project_name}. ` : ''}${named.project_name} (${named.project_id}) is a project in ${named.borrower_country}, sector: ${named.project_global_practice.split(';').map((x) => x.trim()).join(' and ')}. I gathered its records from the project, contract, plan, supervision and document services. Your procurement solution is ready: pick a stage to open it.`,
      steps: [understood(resolved.kind === 'default'
        ? `No project was named, so I picked ${named.project_name} (${named.project_id}), the one with the most contracts.`
        : `Matched ${named.project_name} (${named.project_id}).`), ...steps],
      dossier, projectId: named.project_id, blocks: [{ type: 'ready', projectId: named.project_id }], suggestions: suggestionsFor(db, named, null),
    }
  }

  if (resolved.kind === 'ambiguous') {
    return { ...base, reply: `That could mean ${resolved.projects.map((p) => p.project_name).join(' or ')}. Which one do you want help with?`, options: optionsFor(resolved.projects), suggestions: suggestionsFor(db, null, null) }
  }

  if (intent) {
    return { ...base, reply: db.projects.length === 0 ? 'There are no projects in this demo yet, so there is nothing to show for that.' : 'Which project should I show that for?', options: optionsFor(db.projects), suggestions: suggestionsFor(db, null, null) }
  }
  return {
    ...base,
    reply: db.projects.length === 0
      ? 'There are no projects in this demo yet. Once records are loaded I can set up planning, tender design, monitoring and learning for one.'
      : `I can help with the projects in this demo: ${db.projects.map((p) => p.project_name).join(', ')}. Tell me which one, by name or id, or ask for one of the mock projects, and I will gather its records and set up planning, tender design, monitoring and learning. Once a project is chosen you can ask for a stage, for example "show the plan timeline", for the suppliers, the project data or the knowledge base, or for the whole lifecycle.`,
    options: optionsFor(db.projects), suggestions: suggestionsFor(db, null, null),
  }
}
