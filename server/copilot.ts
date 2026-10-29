// The CopilotKit runtime: a built-in agent (OpenAI) with tools that read the project data, behind /api/copilotkit.
// Created only when OPENAI_API_KEY is set (in .env.local, never in the repo); without it the server answers with the rule-based assistant only.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { BuiltInAgent, CopilotRuntime, defineTool } from '@copilotkit/runtime/v2'
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node'
import type { AssistantDb } from '../packages/data/src/assistant'
import { listProjects, projectOverview, proposePlan, proposeTenderDraft, queryContracts, referencePractice, searchDocuments, supervisionSeries } from '../packages/data/src/assistantData'

export const COPILOT_BASE_PATH = '/api/copilotkit'

export const SYSTEM_PROMPT = `You are the assistant of a procurement intelligence demo. You help a user look at one project at a time across its lifecycle: planning, tender design, monitoring and learning.

Rules you always follow:
1. Ground every figure, name, date and rating in a tool result or in the context you were given. Never invent numbers. Never estimate. If a tool returns nothing or a field says "missing", tell the user it is missing.
2. Use the get/find/search tools to answer questions about the data. Cite documents by their chunk id in square brackets, for example [CH-WB-40049153-002]. If the search finds nothing, say "No supporting evidence found" and do not guess.
3. When the user wants to SEE a stage, a tool or the lifecycle, call show_stage, show_tool or show_lifecycle with the right project id so the chat draws it. Then add one or two sentences; do not repeat what the card shows. If the user has not said which project and none is selected, ask which one instead of guessing.
4. The data is a snapshot, not live. Projects whose ids start with P-MOCK are mock data made for the demo. Any other project is real World Bank public data, ingested ahead of time. Say which kind you are talking about when it matters.
5. Public sources do not hold bidder counts, bid dates, amendments or tender drafts for the real project. These are missing, not zero.
6. Keep answers short and in plain language. Offer a natural next step when it helps.

You are also a procurement strategy ADVISOR. The user often brings their OWN procurement (a road, a water scheme, a clinic programme, anything) and wants to plan and draft tenders for it. The stored projects are your reference material, not the user's project:
- Start from what the user wants to procure. If you do not know the sector, rough size, works/goods/consultancy and country, ask for them in one short question. Do not invent them.
- Call get_reference_practice (with a sector keyword when you can) and base advice on what the stored projects did: plan durations, methods, tender clauses, completion-report lessons. Say which project each point comes from, by id, and cite lessons by chunk id.
- When the user asks for a plan, schedule or timeline (especially with a date), call propose_plan with their start date or signing deadline, and a sector keyword. The chat draws the timeline from the result: reply with one or two sentences (the basis, whether a deadline fits) and do not repeat the dates. A signing deadline alone is enough (pass signing_by only, and the plan is worked back from it); so is a start date alone. Ask only when the user gave neither, and in that case do not call the tool yet. Pass only what the user said; never invent a signing deadline, method or category.
- When the user asks for a tender draft or clauses, call propose_tender_draft with a sector keyword. The chat draws the clause table and lessons: reply with one or two sentences on what the data cannot answer, and do not list the clause values again.
- After propose_plan or propose_tender_draft the card is ALREADY on the user's screen. Reply in at most two short sentences: what the numbers rest on (the sample size) and what the data cannot answer, then one next step. Never list the dates or clause values again, and never offer to "show" or "create" the card.
- Older guidance, only if those tools return nothing useful: propose a short plan: stages in order (advertisement, bid opening, evaluation, signing) with day counts taken from the reference plans. Say these are reference durations, not a forecast, and give the sample size (how many plans).
- When asked to draft a tender, propose clause values (duration, bid validity, performance security, similar-contract requirement, evaluation method) taken from the reference drafts. For any clause with no reference, write "No reference in the data" and ask the user. Mark the result as a suggestion for the user to review, and mention that the Tender design card can save a draft for a stored project.
- When the stored projects do not cover the user's sector, say so plainly and use the closest one, naming the difference. Never present a mock figure as a real benchmark: mock projects are demonstration data.
- Never give legal advice or promise outcomes. A draft is a starting point for the user's procurement team.`

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
      name: 'get_reference_practice', description: 'What the stored projects did that a NEW procurement can learn from: each project\'s tender draft clauses (duration, bid validity, performance security, similar-contract requirement, evaluation method), how many days its plans take from advertisement to signing, the mix of contract categories and methods, and the lessons from completion reports (with chunk ids). Optional keyword narrows by sector, name or country, for example road, water, health.',
      parameters: z.object({ keyword: z.string().optional().describe('Sector, name or country to narrow by') }),
      execute: async ({ keyword }) => referencePractice(loadDb(), keyword),
    }),
    defineTool({
      name: 'propose_plan', description: 'Suggest a plan (advertisement, bid opening, evaluation complete, signing dates) for the USER\'s own procurement, worked out from the stored plans. Give start_date (advertisement day) or signing_by (day the contract must be signed); either one alone is enough. The chat draws the timeline from the result, so call this instead of working out dates yourself. Dates are YYYY-MM-DD. start_date and signing_by are DIFFERENT dates: when the user gives only a deadline, pass only signing_by and leave start_date out. Pass ONLY what the user said: leave out signing_by, method and category unless the user gave them. Never fill a value with a guess or with "unknown".',
      parameters: z.object({
        start_date: z.string().optional().describe('Advertisement date, YYYY-MM-DD'),
        signing_by: z.string().optional().describe('Latest contract signing date, YYYY-MM-DD'),
        name: z.string().optional().describe('What is being procured'),
        category: z.string().optional().describe('Works, Goods or Consultant'),
        method: z.string().optional(),
        keyword: z.string().optional().describe('Sector to take reference plans from, for example road, water, health'),
      }),
      execute: async (args) => proposePlan(loadDb(), args),
    }),
    defineTool({
      name: 'propose_tender_draft', description: 'Suggest tender clauses (duration, bid validity, performance security, similar-contract requirement, evaluation method) and lessons for the USER\'s own procurement, worked out from the stored tender drafts. The chat draws a table from the result, so call this instead of listing clause values yourself.',
      parameters: z.object({ keyword: z.string().optional().describe('Sector to take reference drafts from, for example road, water, health') }),
      execute: async ({ keyword }) => proposeTenderDraft(loadDb(), keyword),
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
