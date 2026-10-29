// The CopilotKit runtime: a built-in agent (OpenAI) with tools that read the project data, behind /api/copilotkit.
// Created only when OPENAI_API_KEY is set (in .env.local, never in the repo); without it the server answers with the rule-based assistant only.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { BuiltInAgent, CopilotRuntime, defineTool } from '@copilotkit/runtime/v2'
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node'
import type { AssistantDb } from '../packages/data/src/assistant'
import { listProjects, projectOverview, queryContracts, searchDocuments, supervisionSeries } from '../packages/data/src/assistantData'

export const COPILOT_BASE_PATH = '/api/copilotkit'

export const SYSTEM_PROMPT = `You are the assistant of a procurement intelligence demo. You help a user look at one project at a time across its lifecycle: planning, tender design, monitoring and learning.

Rules you always follow:
1. Ground every figure, name, date and rating in a tool result or in the context you were given. Never invent numbers. Never estimate. If a tool returns nothing or a field says "missing", tell the user it is missing.
2. Use the get/find/search tools to answer questions about the data. Cite documents by their chunk id in square brackets, for example [CH-WB-40049153-002]. If the search finds nothing, say "No supporting evidence found" and do not guess.
3. When the user wants to SEE a stage, a tool or the lifecycle, call show_stage, show_tool or show_lifecycle with the right project id so the chat draws it. Then add one or two sentences; do not repeat what the card shows. If the user has not said which project and none is selected, ask which one instead of guessing.
4. The data is a snapshot, not live. Projects whose ids start with P-MOCK are mock data made for the demo. Any other project is real World Bank public data, ingested ahead of time. Say which kind you are talking about when it matters.
5. Public sources do not hold bidder counts, bid dates, amendments or tender drafts for the real project. These are missing, not zero.
6. Keep answers short and in plain language. Offer a natural next step when it helps.`

const jsonSchemaId = z.string().describe('Project id, for example P-MOCK-001 or P158504')

/** Builds the tools. Each call reads the data file again, so a reset or a new ingestion shows up without a restart. */
function buildTools(loadDb: () => AssistantDb) {
  return [
    defineTool({
      name: 'list_projects', description: 'List every project with its id, name, country, sector and whether it is mock or real data.',
      parameters: z.object({}), execute: async () => listProjects(loadDb()),
    }),
    defineTool({
      name: 'get_project_overview', description: 'Counts of what exists for one project (contracts, plans, tender drafts, supervision reports, documents), its key dates and its latest supervision ratings.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: async ({ project_id }) => projectOverview(loadDb(), project_id),
    }),
    defineTool({
      name: 'find_contracts', description: 'Find the contracts of a project, with optional filters. Returns how many matched, their total, and up to 25 rows.',
      parameters: z.object({
        project_id: jsonSchemaId,
        supplier: z.string().optional().describe('Part of the supplier name'),
        category: z.string().optional().describe('Part of the procurement category, e.g. Works, Goods, Consultant'),
        method: z.string().optional().describe('Part of the procurement method'),
        signed_from: z.string().optional().describe('Earliest signing date, YYYY-MM-DD'),
        signed_to: z.string().optional().describe('Latest signing date, YYYY-MM-DD'),
        min_amount_usd: z.number().optional(),
        sort_by: z.enum(['amount', 'date']).optional().describe('amount (largest first, default) or date (newest first)'),
        limit: z.number().optional().describe('How many rows to return, default 10'),
      }),
      execute: async (args) => queryContracts(loadDb(), args),
    }),
    defineTool({
      name: 'get_supervision_reports', description: 'The supervision reports of a project in order: ratings, risk, disbursement and restructurings.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: async ({ project_id }) => supervisionSeries(loadDb(), project_id),
    }),
    defineTool({
      name: 'search_documents', description: 'Keyword search over the ingested document text. Returns the best matching passages with chunk ids, document, page and section.',
      parameters: z.object({ query: z.string().describe('Words to look for'), project_id: z.string().optional(), limit: z.number().optional() }),
      execute: async ({ query, project_id, limit }) => searchDocuments(loadDb(), query, project_id, limit),
    }),
  ]
}

/** The request listener for /api/copilotkit, or null when no key is configured. */
export function createCopilotListener(loadDb: () => AssistantDb): ((req: IncomingMessage, res: ServerResponse) => void) | null {
  if (!process.env.OPENAI_API_KEY) return null
  const agent = new BuiltInAgent({
    model: process.env.OPENAI_MODEL ?? 'openai/gpt-4.1-mini',
    maxSteps: 6,
    prompt: SYSTEM_PROMPT,
    tools: buildTools(loadDb),
  })
  const runtime = new CopilotRuntime({ agents: { default: agent } })
  return createCopilotNodeListener({ runtime, basePath: COPILOT_BASE_PATH, cors: true }) as (req: IncomingMessage, res: ServerResponse) => void
}
