import { z } from 'zod'
import { useEffect, useRef, useState } from 'react'
import { CopilotChat, CopilotKitProvider, useAgent, useCopilotKit, UseAgentUpdate, useAgentContext, useConfigureSuggestions, useFrontendTool, useRenderTool } from '@copilotkit/react-core/v2'
import { COPILOT_URL } from '@pi/config'
import { useProjects, useUiStore, suggestedPrompts, Block, projectScope, scopeLabel, useMyLifecycle, describeLifecycle, type FeatureOption } from '@pi/data'
import { BlockView } from './ChatBlocks'
import { MapBlock } from './MapBlock'
import { CompareProjectsCard } from './CompareCard'
import { LifecycleProposal, PlanProposal, PotentialSuppliers, TenderProposal } from './ProposalCards'
import { FeatureOptions, MyLifecycleCard } from './MyLifecycle'
import { LifecycleBubble } from './LifecycleBubble'
import styles from './CopilotPanel.module.css'

const STAGE = z.enum(['planning', 'tender-design', 'monitoring', 'learning'])
const TOOL = z.enum(['suppliers', 'project-data', 'knowledge', 'evidence'])

/** Draws one of our cards in the chat. A card is only drawn once the model has sent a block that passes the same schema the rule-based chat uses. */
function Card({ block }: { block: unknown }) {
  const send = useSendToChat()
  const projects = useProjects()
  const parsed = Block.safeParse(block)
  if (!parsed.success) return null
  // A card for a project that does not exist says so, instead of drawing empty tables the model then talks about.
  const id = parsed.data.projectId
  // A card that needs a stored project and was given none draws nothing: the model is told so and asks, instead of the page showing an empty card.
  if (parsed.data.type === 'tool' ? !id && (parsed.data.tool === 'suppliers' || parsed.data.tool === 'project-data') : !id) return null
  if (id && projects.data && !projects.data.some((p) => p.project_id === id)) return <p role="status" className={styles.problem}>There is no project with id {id}.</p>
  return <div className={styles.cards}><BlockView block={parsed.data} onSend={send} /></div>
}

/** What a click inside a card does: it says the same thing in the chat, as if the user had typed it, and the model answers. */
function useSendToChat() {
  const { agent } = useAgent()
  const { copilotkit } = useCopilotKit()
  return (text: string) => {
    if (agent.isRunning) return
    agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text })
    void copilotkit.runAgent({ agent })
  }
}

/** The cards the model can show. Each is a frontend tool: the model chooses it, the shell draws it with live data. */
function useCardTools() {
  const setProject = useUiStore((s) => s.setProject)
  const setChatProject = useUiStore((s) => s.setChatProject)
  const projects = useProjects()
  // The tool handlers are registered once, so they read the project list through a ref that is refreshed on every render. A list captured at registration
  // time is empty while the projects load, which made every project look unknown and left the conversation without a project.
  const known = useRef(new Set<string>())
  known.current = new Set((projects.data ?? []).map((p) => p.project_id))
  /** Makes the project the one the conversation is about (and the filter's project) when it exists; otherwise the model gets a sentence it has to pass on, and the card says so too. */
  const NO_PROJECT = "No project id was given, so nothing was shown. If the user did not name a project, ask which one (real or mock). If this is about their own procurement, use the suggestion tools instead (propose_suppliers for potential suppliers, propose_lifecycle, propose_plan, propose_tender_draft). Do not tell the user that anything was displayed."
  const open = (projectId: string | null | undefined, shown: string) => {
    if (!projectId) return NO_PROJECT
    if (!known.current.has(projectId)) return `There is no project with id ${projectId}. Tell the user, and ask which project they mean.`
    setProject(projectId)
    setChatProject(projectId)
    return `${shown} (${scopeLabel(projectScope(projectId))}). It is now the project in context.`
  }
  useFrontendTool({
    name: 'set_project_context',
    description: "Change the project the conversation is about. Pass a project id when the user turns to another project without asking to see anything; pass null when they turn to their own procurement (\"my project\", \"my road\"), so nothing is assumed about an existing project.",
    parameters: z.object({ projectId: z.string().nullable() }),
    handler: async ({ projectId }) => {
      if (projectId === null) { setChatProject(null); return 'No project is in context now: the conversation is about the user\'s own procurement.' }
      return open(projectId, `Switched to ${projectId}`)
    },
  })
  useFrontendTool({
    name: 'show_my_lifecycle',
    description: "Show the user's own lifecycle (what they added from suggestions, and which stages are still empty) as a card in the chat.",
    parameters: z.object({}),
    handler: async () => 'Showed the user\'s own lifecycle.',
    render: () => <MyLifecycleInChat />,
  })
  useFrontendTool({
    name: 'show_lifecycle',
    description: 'Show the whole lifecycle (planning, tender design, monitoring, learning) for a project as a card in the chat.',
    parameters: z.object({ projectId: z.string() }),
    handler: async ({ projectId }) => open(projectId, `Showed the lifecycle for ${projectId}`),
    render: ({ args }) => <Card block={{ type: 'lifecycle', projectId: args.projectId }} />,
  })
  useFrontendTool({
    name: 'show_stage',
    description: 'Show one lifecycle stage (planning, tender-design, monitoring or learning) for a project as a card in the chat.',
    parameters: z.object({ step: STAGE, projectId: z.string() }),
    handler: async ({ step, projectId }) => open(projectId, `Showed ${step} for ${projectId}`),
    render: ({ args }) => <Card block={{ type: 'stage', step: args.step, projectId: args.projectId }} />,
  })
  useFrontendTool({
    name: 'show_tool',
    description: 'Show a tool as a card: suppliers, project-data (contracts), knowledge (sources and documents) or evidence (conflicts). projectId may be omitted for knowledge and evidence.',
    parameters: z.object({ tool: TOOL, projectId: z.string().nullable().optional() }),
    handler: async ({ tool, projectId }) => (!projectId && (tool === 'knowledge' || tool === 'evidence') ? `Showed ${tool}.` : open(projectId, `Showed ${tool}`)),
    render: ({ args }) => <Card block={{ type: 'tool', tool: args.tool, projectId: args.projectId ?? null }} />,
  })
}

/** A map card: where the suppliers are (for one project or all), or where the projects are. Marked as a frontend tool so the model can pick it for any "where" question. */
function useMapTool() {
  const projects = useProjects()
  const known = useRef(new Set<string>())
  known.current = new Set((projects.data ?? []).map((p) => p.project_id))
  useFrontendTool({
    name: 'show_map',
    description: 'Show a world map card. kind "suppliers" maps the countries of the suppliers on the contract awards (pass projectId for one project, or null for all); kind "projects" maps the countries of the stored projects. Use it when the user asks where suppliers or projects are, or for a comparison by country. It maps countries, not exact sites.',
    parameters: z.object({ kind: z.enum(['suppliers', 'projects']), projectId: z.string().nullable().optional() }),
    handler: async ({ kind, projectId }) => (projectId && !known.current.has(projectId) ? `There is no project with id ${projectId}. Tell the user, and ask which project they mean.` : `Showed the ${kind} map${projectId ? ` for ${projectId}` : ''}.`),
    render: ({ args }) => (args.kind ? <div className={styles.cards}><MapBlock kind={args.kind} projectId={args.projectId} /></div> : <p>Drawing the map…</p>),
  })
}

/** A comparison card: two to five stored projects of the same kind (all real or all mock) as bar charts and a scatter plot. */
function useCompareTool() {
  const projects = useProjects()
  const known = useRef(new Set<string>())
  known.current = new Set((projects.data ?? []).map((p) => p.project_id))
  useFrontendTool({
    name: 'show_compare',
    description: 'Show a comparison card for two to five stored projects: bar charts of committed amount, contracts, suppliers, average contract, price change after signing, times extended, disbursed and time elapsed, a status line each, and a scatter plot of any two figures. Use it when the user asks to compare projects, or which project has more suppliers, costs more or was extended more. Pass the project ids. All projects must be the same kind (all real or all mock); never mix them. Budget is not in the data: say so if asked, the committed amount is shown instead.',
    parameters: z.object({ projectIds: z.array(z.string()).min(2).max(5) }),
    handler: async ({ projectIds }) => {
      const missing = projectIds.filter((id) => !known.current.has(id))
      if (missing.length > 0) return `There is no project with id ${missing.join(', ')}. Tell the user, and ask which projects they mean.`
      if (new Set(projectIds.map(projectScope)).size > 1) return 'These projects mix real and mock data, so nothing was shown. Tell the user they are not compared with each other and ask for two real projects or two mock projects.'
      return `Showed a comparison of ${projectIds.join(', ')} (${scopeLabel(projectScope(projectIds[0]!))}).`
    },
    render: ({ args }) => (args.projectIds && args.projectIds.length >= 2 ? <div className={styles.cards}><CompareProjectsCard projectIds={args.projectIds} /></div> : <p>Drawing the comparison…</p>),
  })
}

/** The user's own lifecycle drawn in the chat. A click on a missing stage asks the model for the next suggestion, as if the user had typed it. */
function MyLifecycleInChat() {
  const send = useSendToChat()
  return <div className={styles.cards}><MyLifecycleCard onSend={send} /></div>
}

/** A monitoring or learning tool result is a short list of features, each with an Add button. Anything else shows nothing rather than half a card. */
function Options({ stage, title, result }: { stage: 'monitoring' | 'learning'; title: string; result: string | undefined }) {
  try {
    const options = (JSON.parse(result ?? '') as { options?: FeatureOption[] }).options
    return Array.isArray(options) && options.length > 0 ? <div className={styles.cards}><FeatureOptions stage={stage} title={title} options={options} /></div> : null
  } catch { return null }
}

/** The suggestions the server works out (dates, clauses) are drawn with the app's own components. The model only chooses to call the tool; the numbers come from its result. */
/** Tool calls this page has already acted on, so redrawing an old card (the list re-mounting) never clears a project the user came back to later. */
const handledProposals = new Set<string>()

/**
 * A suggestion is for the user's own procurement, not for an existing project, so drawing one takes the conversation off the project it was on
 * (the chip says "No project in context"). Done here, once per suggestion, rather than left to the model remembering to ask for it.
 */
/** What a suggestion was modelled on (the keyword it was worked out for), read from its result: a country, a sector or a project name. */
function referenceOf(result: string | undefined): string | null {
  try {
    const r = JSON.parse(result ?? '') as { keyword?: unknown; filtered_by?: unknown; basis?: { filtered_by?: unknown } }
    const found = [r.keyword, r.filtered_by, r.basis?.filtered_by].find((v): v is string => typeof v === 'string' && v.trim() !== '' && !v.startsWith('all stored'))
    return found ?? null
  } catch { return null }
}

function ForOwnProcurement({ id, result, children }: { id: string; result?: string; children: React.ReactNode }) {
  const setChatProject = useUiStore((s) => s.setChatProject)
  const setReference = useUiStore((s) => s.setReferenceKeyword)
  useEffect(() => {
    if (handledProposals.has(id)) return
    handledProposals.add(id)
    setChatProject(null)
    // Remembered, so a follow-up such as "potential suppliers" is worked out for the same reference without the model having to recall it.
    const reference = referenceOf(result)
    if (reference) setReference(reference)
  }, [id, result, setChatProject, setReference])
  return <>{children}</>
}

function useProposalTools() {
  useRenderTool({
    name: 'propose_suppliers', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <ForOwnProcurement id={p.toolCallId} result={p.result}><div className={styles.cards}><PotentialSuppliers result={p.result} /></div></ForOwnProcurement> : <p>Finding suppliers on the similar projects…</p>),
  }, [])
  useRenderTool({
    name: 'propose_monitoring', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <ForOwnProcurement id={p.toolCallId} result={p.result}><Options stage="monitoring" title="Ways to evaluate and monitor your project" result={p.result} /></ForOwnProcurement> : <p>Looking at the monitoring features…</p>),
  }, [])
  useRenderTool({
    name: 'propose_learning', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <ForOwnProcurement id={p.toolCallId} result={p.result}><Options stage="learning" title="Ways to add learning to your project" result={p.result} /></ForOwnProcurement> : <p>Looking at the learning features…</p>),
  }, [])
  useRenderTool({
    name: 'propose_lifecycle', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <ForOwnProcurement id={p.toolCallId} result={p.result}><div className={styles.cards}><LifecycleProposal result={p.result} /></div></ForOwnProcurement> : <p>Working out estimates from the stored projects…</p>),
  }, [])
  useRenderTool({
    name: 'propose_plan', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <ForOwnProcurement id={p.toolCallId} result={p.result}><div className={styles.cards}><PlanProposal result={p.result} /></div></ForOwnProcurement> : <p>Working out a plan from the stored plans…</p>),
  }, [])
  useRenderTool({
    name: 'propose_tender_draft', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <ForOwnProcurement id={p.toolCallId} result={p.result}><div className={styles.cards}><TenderProposal result={p.result} /></div></ForOwnProcurement> : <p>Working out tender clauses from the stored drafts…</p>),
  }, [])
}

function Inner({ onEngage }: { onEngage: () => void }) {
  const projects = useProjects()
  const chatProjectId = useUiStore((s) => s.chatProjectId)
  useCardTools()
  useMapTool()
  useCompareTool()
  useProposalTools()
  // Once anyone has said anything, the page gives the chat the room (same as the rule-based chat).
  const { agent } = useAgent({ updates: [UseAgentUpdate.OnMessagesChanged] })
  const spoken = agent.messages.length > 0
  useEffect(() => { if (spoken) onEngage() }, [spoken, onEngage])
  const current = (projects.data ?? []).find((p) => p.project_id === chatProjectId)
  useAgentContext({
    description: 'currentProject is the project this conversation is about (null when none): use it whenever the user asks for a stage, a view or a fact without naming a project. projects lists every project; kind says whether each is real World Bank data or mock demo data. Never mix the two kinds in one answer.',
    value: {
      currentProject: current ? { id: current.project_id, name: current.project_name, kind: scopeLabel(projectScope(current.project_id)) } : null,
      projects: (projects.data ?? []).map((p) => ({ id: p.project_id, name: p.project_name, kind: projectScope(p.project_id) })),
    },
  })
  const send = useSendToChat()
  const setChatProject = useUiStore((st) => st.setChatProject)
  const reference = useUiStore((st) => st.referenceKeyword)
  const lcName = useMyLifecycle((st) => st.name)
  const lcItems = useMyLifecycle((st) => st.items)
  const [lcOpen, setLcOpen] = useState(false)
  useAgentContext({
    description: "The user's own lifecycle, built from the suggestions they pressed Add on. stagesStillEmpty lists what is missing. You cannot add to it; the cards have the Add button.",
    value: describeLifecycle(lcName, lcItems),
  })
  useAgentContext({
    description: "What the user's own procurement is modelled on (a country, a sector or a project name), from the last suggestion drawn for it; null when there is none. Use it as the keyword for follow-ups about their own procurement, such as potential suppliers.",
    value: { ownProcurement: { reference } },
  })
  // The prompts come from the stored projects (a request per country they are in), so the chat offers what it can actually answer.
  const prompts = suggestedPrompts(projects.data ?? [])
  useConfigureSuggestions({ suggestions: prompts, available: 'before-first-message' }, [prompts.map((p) => p.message).join('|')])
  return (
    <div className={styles.panel} onFocusCapture={(e) => { if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) onEngage() }}>
      <div className={styles.lcBar}>
        <span className={styles.ctx} role="status">
          {current
            ? <>Project in context: <strong>{current.project_name}</strong> <span className="mono">{current.project_id}</span> · {projectScope(current.project_id)} data{' '}
              <button type="button" onClick={() => setChatProject(null)} aria-label="Clear the project in context">Clear</button></>
            : 'No project in context'}
        </span>
        <button type="button" onClick={() => setLcOpen(true)} aria-haspopup="dialog">My lifecycle · {lcItems.length} {lcItems.length === 1 ? 'item' : 'items'} ▸</button>
      </div>
      <CopilotChat />
      <LifecycleBubble open={lcOpen} onOpenChange={setLcOpen} onSend={send} />
    </div>
  )
}

/** The model-backed chat (CopilotKit). It talks to /api/copilotkit on the assistant server and draws our cards through the tools above. */
export function CopilotPanel({ onEngage }: { onEngage: () => void }) {
  // The chat shows nothing when a run fails (a wrong key, a model that is not available), so say what happened.
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <CopilotKitProvider runtimeUrl={COPILOT_URL} enableInspector={false} onError={({ error }) => setProblem(error.message)}>
      {problem && <p role="alert" className={styles.problem}>The model could not answer: {problem}</p>}
      <Inner onEngage={onEngage} />
    </CopilotKitProvider>
  )
}
