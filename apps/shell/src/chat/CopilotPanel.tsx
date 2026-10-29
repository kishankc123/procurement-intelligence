import { z } from 'zod'
import { useEffect, useState } from 'react'
import { CopilotChat, CopilotKitProvider, useAgent, UseAgentUpdate, useAgentContext, useConfigureSuggestions, useFrontendTool } from '@copilotkit/react-core/v2'
import { COPILOT_URL } from '@pi/config'
import { useProjects, useUiStore, Block } from '@pi/data'
import { BlockView } from './ChatBlocks'
import styles from './CopilotPanel.module.css'

const STAGE = z.enum(['planning', 'tender-design', 'monitoring', 'learning'])
const TOOL = z.enum(['suppliers', 'project-data', 'knowledge', 'evidence'])

/** Draws one of our cards in the chat. A card is only drawn once the model has sent a block that passes the same schema the rule-based chat uses. */
function Card({ block }: { block: unknown }) {
  const parsed = Block.safeParse(block)
  if (!parsed.success) return null
  return <BlockView block={parsed.data} onSend={() => undefined} />
}

/** The cards the model can show. Each is a frontend tool: the model chooses it, the shell draws it with live data. */
function useCardTools() {
  const setProject = useUiStore((s) => s.setProject)
  useFrontendTool({
    name: 'show_lifecycle',
    description: 'Show the whole lifecycle (planning, tender design, monitoring, learning) for a project as a card in the chat.',
    parameters: z.object({ projectId: z.string() }),
    handler: async ({ projectId }) => { setProject(projectId); return `Showed the lifecycle for ${projectId}.` },
    render: ({ args }) => <Card block={{ type: 'lifecycle', projectId: args.projectId }} />,
  })
  useFrontendTool({
    name: 'show_stage',
    description: 'Show one lifecycle stage (planning, tender-design, monitoring or learning) for a project as a card in the chat.',
    parameters: z.object({ step: STAGE, projectId: z.string() }),
    handler: async ({ step, projectId }) => { setProject(projectId); return `Showed ${step} for ${projectId}.` },
    render: ({ args }) => <Card block={{ type: 'stage', step: args.step, projectId: args.projectId }} />,
  })
  useFrontendTool({
    name: 'show_tool',
    description: 'Show a tool as a card: suppliers, project-data (contracts), knowledge (sources and documents) or evidence (conflicts). projectId may be omitted for knowledge and evidence.',
    parameters: z.object({ tool: TOOL, projectId: z.string().nullable().optional() }),
    handler: async ({ tool, projectId }) => { if (projectId) setProject(projectId); return `Showed ${tool}.` },
    render: ({ args }) => <Card block={{ type: 'tool', tool: args.tool, projectId: args.projectId ?? null }} />,
  })
}

function Inner({ onEngage }: { onEngage: () => void }) {
  const projects = useProjects()
  const projectId = useUiStore((s) => s.projectId)
  useCardTools()
  // Once anyone has said anything, the page gives the chat the room (same as the rule-based chat).
  const { agent } = useAgent({ updates: [UseAgentUpdate.OnMessagesChanged] })
  const spoken = agent.messages.length > 0
  useEffect(() => { if (spoken) onEngage() }, [spoken, onEngage])
  useAgentContext({ description: 'The project currently selected in the app, and the projects that exist (mock ones have ids like P-MOCK-001).', value: { selectedProjectId: projectId, projects: (projects.data ?? []).map((p) => ({ id: p.project_id, name: p.project_name })) } })
  useConfigureSuggestions({ suggestions: [{ title: 'Mock projects', message: 'Help me with one of the mock projects' }, { title: 'Data source', message: 'What is the data source?' }], available: 'before-first-message' })
  return (
    <div className={styles.panel} onFocusCapture={(e) => { if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) onEngage() }}>
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
