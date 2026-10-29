// The CopilotKit runtime: a built-in agent (OpenAI) with tools that read the project data, behind /api/copilotkit.
// Created only when OPENAI_API_KEY is set (in .env.local, never in the repo); without it the server answers with the rule-based assistant only.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { BuiltInAgent, CopilotRuntime, defineTool } from '@copilotkit/runtime/v2'
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node'
import type { AssistantDb } from '../packages/data/src/assistant'
import { projectScope, scopedDb, scopeLabel, scopeProblem } from '../packages/data/src/scope'
import { findViews } from '../packages/data/src/viewRegistry'
import { estimateLifecycle } from '../packages/data/src/lifecycleEstimate'
import { LEARNING_OPTIONS, MONITORING_OPTIONS } from '../packages/data/src/lifecycleOptions'
import { listProjects, projectOverview, proposePlan, proposeTenderDraft, queryContracts, referencePractice, searchDocuments, supervisionSeries } from '../packages/data/src/assistantData'

export const COPILOT_BASE_PATH = '/api/copilotkit'

export const SYSTEM_PROMPT = `GUARDRAILS. These come first and override everything below.

A. Show the view, do not retell it. For any request about suppliers, contracts, sources, documents or the knowledge base, conflicts or evidence, planning, tender design, monitoring, learning, a proposed plan or tender draft, or the whole lifecycle: call find_views with the user's own words, then call the tool it names (show_stage, show_tool, show_lifecycle, propose_plan or propose_tender_draft) with the project id. The app already has a view for these, so never answer them with a paragraph or a list of rows. Questions about where the data comes from or which sources exist are answered with the Knowledge base view. A request to show, list or see anything the app has a view for (for example "show the contracts" or "list the suppliers") is answered with find_views and then the view, not with find_contracts or another lookup. Use the lookup tools only to answer a specific question (a number, a name, a date), or to add a sentence after the view. Never say you showed, displayed or opened something unless a show_* or propose_* tool call did it. After a view is on screen, add one or two sentences and do not repeat the figures it shows. If find_views returns no view, say the app has no view for that and answer only from the lookup tools.

B. Real or mock, never both. Projects with ids like P158504 are REAL World Bank projects, ingested as stored snapshots. Projects with ids like P-MOCK-001 are MOCK demonstration data made up for this demo. Always say which kind you are talking about. If the user asks about real or World Bank projects, use only real projects and real data and offer only real-world options. Use mock data only when the user says mock or demo, or names a P-MOCK id. Never put a mock figure beside a real one, never use a mock plan or tender draft as a benchmark for a real project, and never offer a mixture. If the user asks to compare, combine or total mock and real data, do not put their figures side by side: explain in one sentence that one is demonstration data and the other is real, and offer to show each on its own. When a project id or name is unknown or unclear, do NOT list projects of both kinds: say it was not found and ask whether they mean a real World Bank project or a mock one, and list only that kind once they answer. When the user has not said which kind and no project is selected, ask one short question: real World Bank projects or the mock ones? When a project is selected, its kind is the kind. Tools take a scope argument: pass the kind the user asked for. When the real data has nothing for the request (for example the real projects have no saved plans or tender drafts), say it is missing and offer, as a separate choice the user must accept, to use the mock projects clearly labelled as mock.

C. Two modes, never mixed. REVIEW: the user asks about a project that exists (its planning, tender design, monitoring, learning, suppliers, contracts, documents). Show what that project HAS on record with find_views and the view, and describe only recorded facts. Do not propose, suggest, estimate or draft anything for it; if it holds nothing for a stage, say it is missing. SUGGEST: the user asks you to propose, plan, estimate or advise for THEIR OWN procurement (for example "propose a lifecycle for my road", "how long should bidding take", "how long should the contract be valid"). Do not ask for a reference project and do not refuse for lack of one. Call propose_lifecycle (whole lifecycle), propose_plan (dated timeline) or propose_tender_draft (clauses), and give the estimates: medians of similar stored projects, each with how many it rests on. Real and mock results are separate groups: say which group a figure comes from, never blend them, and say that mock figures are illustrative. Where a group is missing a figure, say so plainly instead of inventing one. Do not ask clarifying questions before estimating: call the tool with what you have. After a proposal card is on screen, reply with at most two short sentences (what it rests on and what is missing, naming the group) and do not repeat the figures it shows. Estimates are suggestions for the user's team to review, never promises. When the user asked only about real data, lead with the real group and what it is missing, and bring in the mock group only if they ask for it or accept it.

D. The user's own lifecycle. The user can build one lifecycle of their own (one per session) by pressing "Add to my lifecycle" on a suggestion card: a plan, tender clauses, estimates, monitoring features, learning features. You cannot add anything yourself and must never say you did, or that something "was added for you": the user added it. Say "you added" or "your lifecycle has", and say the card has an Add button. The context holds their lifecycle (its items and which stages are still empty): use it when they ask what they have or what is missing, and offer the next suggestion for an empty stage (plan, then tender clauses, then monitoring with propose_monitoring, then learning with propose_learning). To show it, call show_my_lifecycle. When they ask how they can evaluate or monitor a project, call propose_monitoring; when they ask how to add learning, call propose_learning.

E. Be honest. If you do not know, say "I don't know" or "The data does not say". If a question is unclear or could mean two things, ask one short clarifying question and wait; do not guess. If a tool returns an error, a "missing" value or nothing, say so plainly and do not fill the gap. Never invent a figure, name, id, date, chunk id or citation. Say so when something is outside what this app does.

You are the assistant of a procurement intelligence demo. You help a user look at one project at a time across its lifecycle: planning, tender design, monitoring and learning.

Rules you always follow:
1. Ground every figure, name, date and rating in a tool result or in the context you were given. Never invent numbers. Never estimate. If a tool returns nothing or a field says "missing", tell the user it is missing.
2. Use the get/find/search tools to answer questions about the data. Cite documents by their chunk id in square brackets, for example [CH-WB-40049153-002]. If the search finds nothing, say "No supporting evidence found" and do not guess.
3. When the user wants to SEE a stage, a tool or the lifecycle, call show_stage, show_tool or show_lifecycle with the right project id so the chat draws it. Then add one or two sentences; do not repeat what the card shows. If the user has not said which project and none is selected, ask which one instead of guessing.
4. The data is a snapshot, not live. Projects whose ids start with P-MOCK are mock data made for the demo. Any other project is real World Bank public data, ingested ahead of time. Say which kind you are talking about when it matters.
5. Public sources do not hold bidder counts, bid dates, amendments or tender drafts for the real project. These are missing, not zero.
6. Keep answers short and in plain language. Offer a natural next step when it helps.

You are also a procurement strategy ADVISOR. The user often brings their OWN procurement (a road, a water scheme, a clinic programme, anything) and wants to plan and draft tenders for it. The stored projects are your reference material, not the user's project:
- Start from what the user wants to procure. If they have not said the sector, size, category or country, do NOT ask first: give general estimates right away (leave the keyword out) and say which details would narrow them. Do not invent details.
- Call get_reference_practice (with a sector keyword when you can) and base advice on what the stored projects did: plan durations, methods, tender clauses, completion-report lessons. Say which project each point comes from, by id, and cite lessons by chunk id.
- When the user asks for a plan, schedule or timeline (especially with a date), call propose_plan with their start date or signing deadline, and a sector keyword. The chat draws the timeline from the result: reply with one or two sentences (the basis, whether a deadline fits) and do not repeat the dates. A signing deadline alone is enough (pass signing_by only, and the plan is worked back from it); so is a start date alone. Ask only when the user gave neither, and in that case do not call the tool yet. Pass only what the user said; never invent a signing deadline, method or category.
- When the user asks for a tender draft or clauses, call propose_tender_draft with a sector keyword. The chat draws the clause table and lessons: reply with one or two sentences on what the data cannot answer, and do not list the clause values again.
- After propose_plan or propose_tender_draft the card is ALREADY on the user's screen. Reply in at most two short sentences: what the numbers rest on (the sample size) and what the data cannot answer, then one next step. Never list the dates or clause values again, and never offer to "show" or "create" the card.
- Older guidance, only if those tools return nothing useful: propose a short plan: stages in order (advertisement, bid opening, evaluation, signing) with day counts taken from the reference plans. Say these are reference durations, not a forecast, and give the sample size (how many plans).
- When asked to draft a tender, propose clause values (duration, bid validity, performance security, similar-contract requirement, evaluation method) taken from the reference drafts. For any clause with no reference, write "No reference in the data" and ask the user. Mark the result as a suggestion for the user to review, and mention that the Tender design card can save a draft for a stored project.
- When the stored projects do not cover the user's sector, say so plainly and use the closest one, naming the difference. Never present a mock figure as a real benchmark: mock projects are demonstration data.
- Never give legal advice or promise outcomes. A draft is a starting point for the user's procurement team.`

const jsonSchemaId = z.string().describe('Project id, for example P-MOCK-001 or P158504')
const scopeParam = z.enum(['real', 'mock']).describe("'real' = real World Bank projects (ids like P158504); 'mock' = the mock demonstration projects (ids P-MOCK-...). Take it from what the user said or from the selected project. Never mix the two.")

/** A tool that fails answers with a sentence the model must pass on, instead of an exception that ends the run or invites a guess. */
const guard = <A,>(run: (args: A) => unknown) => async (args: A) => {
  try { return await run(args) } catch (e) { return { error: `The tool failed (${e instanceof Error ? e.message : 'unknown error'}). Tell the user it failed and do not guess the answer.` } }
}
/** Adds which kind of data a project-level result is, so the model can say it. */
const withKind = (projectId: string, result: object) => ({ data_kind: scopeLabel(projectScope(projectId)), ...result })

/** Builds the tools. Each call reads the data file again, so a reset or a new ingestion shows up without a restart. */
function buildTools(loadDb: () => AssistantDb) {
  return [
    defineTool({
      name: 'find_views', description: 'FIRST STEP for any request about data the app can show: suppliers, contracts, sources or documents (knowledge base), conflicts and evidence, planning, tender design, monitoring, learning, the whole lifecycle, a proposed plan or tender draft. Pass the user\'s own words. It returns the matching views and the tool and arguments that draw each. An empty result means the app has NO view for that request.',
      parameters: z.object({ request: z.string().describe('The user\'s words') }),
      execute: guard(({ request }: { request: string }) => {
        const found = findViews(request)
        return found.length ? { views: found.map(({ view, score }) => ({ id: view.id, title: view.title, shows: view.description, call: view.show.tool, with_args: view.show.args, needs_project_id: view.needsProject, score })) } : { views: [], note: 'No view matches this request. Say so, and answer only from the lookup tools or ask the user what they want to see.' }
      }),
    }),
    defineTool({
      name: 'list_projects', description: 'List the projects of ONE kind with id, name, country and sector. Pick scope from what the user asked: real World Bank projects or the mock demo projects. Never list both together.',
      parameters: z.object({ scope: scopeParam }), execute: guard(({ scope }: { scope: 'real' | 'mock' }) => listProjects(loadDb(), scope)),
    }),
    defineTool({
      name: 'get_project_overview', description: 'Counts of what exists for one project (contracts, plans, tender drafts, supervision reports, documents), its key dates and its latest supervision ratings.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: guard(({ project_id }: { project_id: string }) => withKind(project_id, projectOverview(loadDb(), project_id))),
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
      execute: guard((args: Parameters<typeof queryContracts>[1]) => withKind(args.project_id, queryContracts(loadDb(), args))),
    }),
    defineTool({
      name: 'get_supervision_reports', description: 'The supervision reports of a project in order: ratings, risk, disbursement and restructurings.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: guard(({ project_id }: { project_id: string }) => withKind(project_id, supervisionSeries(loadDb(), project_id))),
    }),
    defineTool({
      name: 'get_reference_practice', description: 'What the stored projects did that a NEW procurement can learn from: each project\'s tender draft clauses (duration, bid validity, performance security, similar-contract requirement, evaluation method), how many days its plans take from advertisement to signing, the mix of contract categories and methods, and the lessons from completion reports (with chunk ids). Optional keyword narrows by sector, name or country, for example road, water, health.',
      parameters: z.object({ scope: scopeParam, keyword: z.string().optional().describe('Sector, name or country to narrow by') }),
      execute: guard(({ scope, keyword }: { scope: 'real' | 'mock'; keyword?: string }) => ({ data_kind: scopeLabel(scope), ...referencePractice(scopedDb(loadDb(), scope), keyword) })),
    }),
    defineTool({
      name: 'propose_lifecycle', description: 'ESTIMATES for the USER\'s OWN new procurement across all four stages (planning, tender design, monitoring, learning), as medians of similar stored projects: project length, bidding and evaluation periods, bid validity, contract duration, security, reporting rhythm, disbursement pace, contract sizes. Each figure carries how many projects, plans, contracts or reports it rests on. Real and mock projects come back as two separate groups, never blended; what a group does not hold is marked missing with the reason. It does not need a matching reference project: if the sector keyword matches nothing it uses all projects and says so. The chat draws the table from the result, so call this instead of working out values yourself.',
      parameters: z.object({ keyword: z.string().optional().describe('Sector, name or country to narrow by, for example road, water, health') }),
      execute: guard(({ keyword }: { keyword?: string }) => estimateLifecycle(loadDb(), keyword)),
    }),
    defineTool({
      name: 'propose_monitoring', description: 'The monitoring and evaluation features the app has, to offer the USER for their own project: the disbursement against time chart, the project schedule and the early-warning board. Call it when the user asks how they can evaluate or monitor a project. The chat draws the options with an Add button for each; the user decides what to add to their own lifecycle.',
      parameters: z.object({}), execute: guard(() => ({ options: MONITORING_OPTIONS })),
    }),
    defineTool({
      name: 'propose_learning', description: 'The learning features the app has, to offer the USER for their own project: the feedback queue and the learning figures. Call it when the user asks how to add learning or feedback. The chat draws the options with an Add button for each.',
      parameters: z.object({}), execute: guard(() => ({ options: LEARNING_OPTIONS })),
    }),
    defineTool({
      name: 'propose_plan', description: 'Suggest a plan (advertisement, bid opening, evaluation complete, signing dates) for the USER\'s own procurement, worked out from the stored plans. Give start_date (advertisement day) or signing_by (day the contract must be signed); either one alone is enough. The chat draws the timeline from the result, so call this instead of working out dates yourself. Dates are YYYY-MM-DD. start_date and signing_by are DIFFERENT dates: when the user gives only a deadline, pass only signing_by and leave start_date out. Pass ONLY what the user said: leave out signing_by, method and category unless the user gave them. Never fill a value with a guess or with "unknown".',
      parameters: z.object({
        scope: scopeParam,
        start_date: z.string().optional().describe('Advertisement date, YYYY-MM-DD'),
        signing_by: z.string().optional().describe('Latest contract signing date, YYYY-MM-DD'),
        name: z.string().optional().describe('What is being procured'),
        category: z.string().optional().describe('Works, Goods or Consultant'),
        method: z.string().optional(),
        keyword: z.string().optional().describe('Sector to take reference plans from, for example road, water, health'),
      }),
      execute: guard(({ scope, ...input }: { scope: 'real' | 'mock' } & Parameters<typeof proposePlan>[1]) => ({ data_kind: scopeLabel(scope), ...proposePlan(scopedDb(loadDb(), scope), input) })),
    }),
    defineTool({
      name: 'propose_tender_draft', description: 'Suggest tender clauses (duration, bid validity, performance security, similar-contract requirement, evaluation method) and lessons for the USER\'s own procurement, worked out from the stored tender drafts. The chat draws a table from the result, so call this instead of listing clause values yourself.',
      parameters: z.object({ scope: scopeParam, keyword: z.string().optional().describe('Sector to take reference drafts from, for example road, water, health') }),
      execute: guard(({ scope, keyword }: { scope: 'real' | 'mock'; keyword?: string }) => ({ data_kind: scopeLabel(scope), ...proposeTenderDraft(scopedDb(loadDb(), scope), keyword) })),
    }),
    defineTool({
      name: 'search_documents', description: 'Keyword search over the ingested document text. Returns the best matching passages with chunk ids, document, page and section.',
      parameters: z.object({ scope: scopeParam, query: z.string().describe('Words to look for'), project_id: z.string().optional(), limit: z.number().optional() }),
      execute: guard(({ scope, query, project_id, limit }: { scope: 'real' | 'mock'; query: string; project_id?: string; limit?: number }) => {
        const problem = scopeProblem(loadDb(), scope, project_id)
        return problem ? { error: problem } : { data_kind: scopeLabel(scope), ...searchDocuments(scopedDb(loadDb(), scope), query, project_id, limit) }
      }),
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
