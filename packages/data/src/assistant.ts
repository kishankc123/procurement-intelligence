import { z } from 'zod'
import type { Amendment, Chunk, CompletionReport, Contract, ContractMilestone, Doc, Feedback, Plan, Project, SupervisionReport, TenderDraft } from './schemas'

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
export const Block = z.discriminatedUnion('type', [
  /** Everything was gathered: text, the big donut and what was found per stage. */
  z.object({ type: z.literal('ready'), projectId: z.string() }),
  /** The whole lifecycle as the big donut. */
  z.object({ type: z.literal('lifecycle'), projectId: z.string() }),
  /** One stage, headed by the small donut. */
  z.object({ type: z.literal('stage'), step: z.enum(STAGES), projectId: z.string() }),
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
})
export type AssistantReply = z.infer<typeof AssistantReply>

/** The slice of db.json the assistant reads. */
export interface AssistantDb {
  projects: Project[]
  contracts: Contract[]
  plans: Plan[]
  tender_drafts: TenderDraft[]
  supervision_reports: SupervisionReport[]
  completion_reports: CompletionReport[]
  documents: Doc[]
  chunks: Chunk[]
  amendments: Amendment[]
  contract_milestones: ContractMilestone[]
  feedback: Feedback[]
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
    // No project named: take the one with the most contracts, and say so in the reply.
    const counts = new Map<string, number>()
    for (const c of db.contracts) counts.set(c.project_id, (counts.get(c.project_id) ?? 0) + 1)
    const fullest = [...db.projects].sort((a, b) => (counts.get(b.project_id) ?? 0) - (counts.get(a.project_id) ?? 0))[0]
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

export type Intent = 'lifecycle' | LifecycleStage

// Plain labels, not imported from @pi/config: the Vercel function loads this file on its own, without the workspace packages. A test keeps them equal to the donut's.
export const STAGE_LABEL: Record<LifecycleStage, string> = { planning: 'Planning', 'tender-design': 'Tender design', monitoring: 'Monitoring', learning: 'Learning' }

/**
 * What does the user want to see? The whole lifecycle comes first ("the entire timeline"), then a single stage.
 * Rule-based on purpose, so it is easy to read and to test. Returns null when nothing matches.
 */
export function detectIntent(message: string): Intent | null {
  const t = message.toLowerCase()
  if (/\b(entire|whole|full|complete|all)\b.{0,12}\b(timeline|lifecycle|stages|process|journey)\b|\blifecycle\b|\ball (the )?(stages|steps)\b/.test(t)) return 'lifecycle'
  if (/\btender|\bdraft|\bclause|\bspecification|bid validity/.test(t)) return 'tender-design'
  if (/\bmonitor|\balert|\bwarning|\bschedule|\bdisburs|\bexecution|\bsupervision/.test(t)) return 'monitoring'
  if (/\blearn|\bfeedback|\blesson/.test(t)) return 'learning'
  if (/\bplan|\btimeline|\bpackage/.test(t)) return 'planning'
  return null
}

/** One suggestive sentence for a stage, from the records the services returned. Zero is said plainly. */
function stageIntro(db: AssistantDb, project: Project, step: LifecycleStage): string {
  const name = project.project_name
  if (step === 'planning') {
    const plans = db.plans.filter((p) => p.project_id === project.project_id)
    if (plans.length === 0) return `I found no procurement plans for ${name}. Plans are entered by a planner, so there is nothing to show yet.`
    return `I found ${plans.length} procurement ${plans.length === 1 ? 'plan' : 'plans'} for ${name}. The timeline shows the four tender stages of the selected plan; pick another plan in the table to compare, or switch stage with the donut.`
  }
  if (step === 'tender-design') {
    const draft = db.tender_drafts.find((d) => d.project_id === project.project_id)
    return draft
      ? `A tender draft is already saved for ${name}. I show your figures with my suggestion beside each one, so you can compare and save changes.`
      : `There is no tender draft for ${name} yet, so I prepared a suggested one from its plans and contract data. Anything I cannot support with data is left for you to fill in.`
  }
  if (step === 'monitoring') {
    const reports = db.supervision_reports.filter((r) => r.project_id === project.project_id)
    if (reports.length === 0) return `There are no supervision reports for ${name}, so I cannot show how it is performing yet.`
    return `${name} has ${reports.length} supervision ${reports.length === 1 ? 'report' : 'reports'}. Below are its disbursement against time, its schedule and the warnings I found, urgent ones first.`
  }
  if (step === 'learning') {
    const total = db.feedback.length
    if (total === 0) return `Nobody has rated an answer yet, so there is nothing to learn from. Rate anything I show with Helpful or Not helpful and it will appear here for a reviewer.`
    const accepted = db.feedback.filter((f) => f.status === 'accepted').length
    const reviewed = db.feedback.filter((f) => f.status !== 'new').length
    return `Users have left ${total} ${total === 1 ? 'piece' : 'pieces'} of feedback so far: ${reviewed} reviewed and ${accepted} accepted. Reviewers decide on each one below, and every decision is logged.`
  }
  return `Here is ${STAGE_LABEL[step]} for ${name}.`
}

const NO_PROJECT: Omit<AssistantReply, 'reply' | 'options'> = { simulated: true, steps: [], dossier: null, projectId: null, blocks: [] }

const understood = (detail: string): AssistantStep => ({ id: 'understand', service: 'Assistant', label: 'Understood the request', detail, records: 0 })

/**
 * The assistant: understand the message, pick a project and what to show, and answer with what the services returned. Pure, so it can be tested.
 * `contextProjectId` is the project the conversation is already about: it is used when the message names none.
 */
export function answer(db: AssistantDb, message: string, contextProjectId?: string): AssistantReply {
  const intent = detectIntent(message)
  const resolved = resolveProject(message, db)
  const known = db.projects.find((p) => p.project_id === contextProjectId)
  const asks = (p: Project) => (intent ? `Show ${intent === 'lifecycle' ? 'the whole lifecycle' : STAGE_LABEL[intent].toLowerCase()} for ${p.project_name}` : `Help me with ${p.project_name}`)
  const optionsFor = (projects: Project[]) => projects.map((p) => ({ projectId: p.project_id, label: p.project_name, prompt: asks(p) }))

  // A project named in the message wins, then "one of the mock projects", then the project the conversation is about.
  const project = resolved.kind === 'project' || resolved.kind === 'default' ? resolved.project : resolved.kind === 'none' ? known : undefined

  if (project && intent) {
    const picked = resolved.kind === 'default' ? ` No project was named, so I took ${project.project_name}.` : ''
    if (intent === 'lifecycle') {
      return {
        reply: `Here is the whole lifecycle for ${project.project_name}.${picked} Pick a stage to open it.`, simulated: true,
        steps: [understood(`Showing the lifecycle of ${project.project_name} (${project.project_id}).`)], options: [], dossier: null,
        projectId: project.project_id, blocks: [{ type: 'lifecycle', projectId: project.project_id }],
      }
    }
    return {
      reply: `${stageIntro(db, project, intent)}${picked}`, simulated: true,
      steps: [understood(`Opening ${STAGE_LABEL[intent]} for ${project.project_name} (${project.project_id}).`)], options: [], dossier: null,
      projectId: project.project_id, blocks: [{ type: 'stage', step: intent, projectId: project.project_id }],
    }
  }

  if ((resolved.kind === 'project' || resolved.kind === 'default') && !intent) {
    const { project: named } = resolved
    const { dossier, steps } = buildDossier(db, named)
    return {
      reply: `${resolved.kind === 'default' ? `You did not name a project, so I took ${named.project_name}. ` : ''}${named.project_name} (${named.project_id}) is a ${named.project_global_practice.toLowerCase()} project in ${named.borrower_country}. I gathered its records from the project, contract, plan, supervision and document services. Your procurement solution is ready: pick a stage to open it.`,
      simulated: true,
      steps: [understood(resolved.kind === 'default'
        ? `No project was named, so I picked ${named.project_name} (${named.project_id}), the one with the most contracts.`
        : `Matched ${named.project_name} (${named.project_id}).`), ...steps],
      options: [], dossier, projectId: named.project_id, blocks: [{ type: 'ready', projectId: named.project_id }],
    }
  }

  if (resolved.kind === 'ambiguous') {
    return {
      ...NO_PROJECT,
      reply: `That could mean ${resolved.projects.map((p) => p.project_name).join(' or ')}. Which one do you want help with?`,
      options: optionsFor(resolved.projects),
    }
  }

  if (intent) {
    return { ...NO_PROJECT, reply: 'Which project should I show that for?', options: optionsFor(db.projects) }
  }
  return {
    ...NO_PROJECT,
    reply: `I can help with the projects in this demo: ${db.projects.map((p) => p.project_name).join(', ')}. Tell me which one, by name or id, or ask for one of the mock projects, and I will gather its records and set up planning, tender design, monitoring and learning. Once a project is chosen you can ask for a stage, for example "show the plan timeline", or for the whole lifecycle.`,
    options: optionsFor(db.projects),
  }
}
