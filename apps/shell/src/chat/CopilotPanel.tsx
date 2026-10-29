import { z } from 'zod'
import { useEffect, useState } from 'react'
import { CopilotChat, CopilotKitProvider, useAgent, useCopilotKit, UseAgentUpdate, useAgentContext, useConfigureSuggestions, useFrontendTool, useRenderTool } from '@copilotkit/react-core/v2'
import { COPILOT_URL } from '@pi/config'
import { useProjects, useUiStore, Block, projectScope, scopeLabel, useMyLifecycle, describeLifecycle, type FeatureOption } from '@pi/data'
import { BlockView } from './ChatBlocks'
import { LifecycleProposal, PlanProposal, TenderProposal } from './ProposalCards'
import { FeatureOptions, MyLifecycleCard } from './MyLifecycle'
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
  const projects = useProjects()
  const known = new Set((projects.data ?? []).map((p) => p.project_id))
  /** Selects the project when it exists; otherwise the model gets a sentence it has to pass on, and the card says so too. */
  const open = (projectId: string | null | undefined, shown: string) => {
    if (!projectId) return shown
    if (!known.has(projectId)) return `There is no project with id ${projectId}. Tell the user, and ask which project they mean.`
    setProject(projectId)
    return `${shown} (${scopeLabel(projectScope(projectId))}).`
  }
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
    handler: async ({ tool, projectId }) => open(projectId, `Showed ${tool}`),
    render: ({ args }) => <Card block={{ type: 'tool', tool: args.tool, projectId: args.projectId ?? null }} />,
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
function useProposalTools() {
  useRenderTool({
    name: 'propose_monitoring', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <Options stage="monitoring" title="Ways to evaluate and monitor your project" result={p.result} /> : <p>Looking at the monitoring features…</p>),
  }, [])
  useRenderTool({
    name: 'propose_learning', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <Options stage="learning" title="Ways to add learning to your project" result={p.result} /> : <p>Looking at the learning features…</p>),
  }, [])
  useRenderTool({
    name: 'propose_lifecycle', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <div className={styles.cards}><LifecycleProposal result={p.result} /></div> : <p>Working out estimates from the stored projects…</p>),
  }, [])
  useRenderTool({
    name: 'propose_plan', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <div className={styles.cards}><PlanProposal result={p.result} /></div> : <p>Working out a plan from the stored plans…</p>),
  }, [])
  useRenderTool({
    name: 'propose_tender_draft', parameters: z.object({}).passthrough(),
    render: (p) => (p.status === 'complete' ? <div className={styles.cards}><TenderProposal result={p.result} /></div> : <p>Working out tender clauses from the stored drafts…</p>),
  }, [])
}

function Inner({ onEngage }: { onEngage: () => void }) {
  const projects = useProjects()
  const projectId = useUiStore((s) => s.projectId)
  useCardTools()
  useProposalTools()
  // Once anyone has said anything, the page gives the chat the room (same as the rule-based chat).
  const { agent } = useAgent({ updates: [UseAgentUpdate.OnMessagesChanged] })
  const spoken = agent.messages.length > 0
  useEffect(() => { if (spoken) onEngage() }, [spoken, onEngage])
  const firstReal = (projects.data ?? []).find((p) => projectScope(p.project_id) === 'real')
  const selected = (projects.data ?? []).find((p) => p.project_id === projectId)
  useAgentContext({
    description: 'The project selected in the app and the projects that exist. kind says whether each is real World Bank data or mock demo data. Never mix the two kinds in one answer.',
    value: {
      selectedProject: selected ? { id: selected.project_id, name: selected.project_name, kind: scopeLabel(projectScope(selected.project_id)) } : null,
      projects: (projects.data ?? []).map((p) => ({ id: p.project_id, name: p.project_name, kind: projectScope(p.project_id) })),
    },
  })
  const lcName = useMyLifecycle((st) => st.name)
  const lcItems = useMyLifecycle((st) => st.items)
  const [lcOpen, setLcOpen] = useState(false)
  useAgentContext({
    description: "The user's own lifecycle, built from the suggestions they pressed Add on. stagesStillEmpty lists what is missing. You cannot add to it; the cards have the Add button.",
    value: describeLifecycle(lcName, lcItems),
  })
  useConfigureSuggestions({
    suggestions: [
      { title: 'Plan my procurement', message: 'I want to procure a new road rehabilitation project. Using the mock projects as reference, help me plan it: which stages, how long each takes, and which procurement methods to use.' },
      { title: 'Draft a tender', message: 'Help me draft a tender for works on a rural water supply scheme. Use the mock projects as sources for bid validity, duration, performance security and evaluation method, and tell me what the data cannot answer.' },
      { title: 'Lessons learned', message: 'What lessons from the completion reports should I apply when I design tenders for a new project?' },
      { title: 'Compare the projects', message: 'Compare the three mock projects: how long their plans take, their methods and their tender clauses.' },
      { title: 'Real projects', message: 'Which real World Bank projects do you have?' },
      ...(firstReal ? [{ title: 'Real suppliers', message: `Show the suppliers of the real project ${firstReal.project_name}.` }] : []),
      { title: 'Data source', message: 'What are the data sources?' },
    ],
    available: 'before-first-message' }, [firstReal?.project_id])
  return (
    <div className={styles.panel} onFocusCapture={(e) => { if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) onEngage() }}>
      <div className={styles.lcBar}>
        <button type="button" onClick={() => setLcOpen(!lcOpen)} aria-expanded={lcOpen}>My lifecycle · {lcItems.length} {lcItems.length === 1 ? 'item' : 'items'} {lcOpen ? '▾' : '▸'}</button>
      </div>
      {lcOpen && <MyLifecycleInChat />}
      <CopilotChat />
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
