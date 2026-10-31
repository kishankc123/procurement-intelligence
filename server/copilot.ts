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
import { suggestPlan, suggestTenderClauses } from '../packages/data/src/tenderSuggestion'
import { potentialSuppliers } from '../packages/data/src/potentialSuppliers'
import { LEARNING_OPTIONS, MONITORING_OPTIONS } from '../packages/data/src/lifecycleOptions'
import type { ProjectCandidate } from '../packages/data/src/ingestEvents'
import { semanticSearch, type SemanticDeps } from './semantic'
import { analyseProject, analyseProjectRisks, findComparableProjects, getDataGaps, scanRiskEvidence, type ComparableInput } from '../packages/data/src/analysis'
import type { DataScope } from '../packages/data/src/scope'
import { listProjects, planPackages, projectOverview, proposePlan, proposeTenderDraft, queryContracts, referencePractice, searchDocuments, supervisionSeries, tenderNotices } from '../packages/data/src/assistantData'

export const COPILOT_BASE_PATH = '/api/copilotkit'

export const SYSTEM_PROMPT = `GUARDRAILS. These come first and override everything below.

A. Show the view, do not retell it. For any request about suppliers, contracts, sources, documents or the knowledge base, conflicts or evidence, planning, tender design, monitoring, learning, a proposed plan or tender draft, or the whole lifecycle: call find_views with the user's own words, then call the tool it names (show_stage, show_tool, show_map, show_lifecycle, propose_plan or propose_tender_draft) with the project id. The app already has a view for these, so never answer them with a paragraph or a list of rows. Questions about where the data comes from or which sources exist are answered with the Knowledge base view. A request to show, list or see anything the app has a view for (for example "show the contracts" or "list the suppliers") is answered with find_views and then the view, not with find_contracts or another lookup. Use the lookup tools only to answer a specific question (a number, a name, a date), or to add a sentence after the view. Never say you showed, displayed or opened something unless a show_* or propose_* tool call did it. After a view is on screen, do not repeat its figures: say in a few sentences what they mean for the user's decision (rule O). A question that asks for judgement (risks, what to watch, why something happened, what to do next, how projects compare, what can be learned) is analytical: answer it by rule O, and show a view only if it adds something. If find_views returns no view, say the app has no view for that and answer only from the lookup tools.

B. Real or mock, never both. Projects with ids like P158504 are REAL World Bank projects, ingested as stored snapshots. Projects with ids like P-MOCK-001 are MOCK demonstration data made up for this demo. Always say which kind you are talking about. If the user asks about real or World Bank projects, use only real projects and real data and offer only real-world options. Use mock data only when the user says mock or demo, or names a P-MOCK id. Never put a mock figure beside a real one, never put a mock figure beside a real one without saying which is which, and never offer a mixture of the two as one number. The one exception is a plan or tender draft suggested for the user's own procurement: the real projects hold no tender clauses or stage dates, so the suggestion uses real figures where they exist and the stored demonstration drafts and plans for the rest, loosely matched, each clause or plan saying which it is. If the user asks to compare, combine or total mock and real data, do not put their figures side by side: explain in one sentence that one is demonstration data and the other is real, and offer to show each on its own. When a project id or name is unknown or unclear, do NOT list projects of both kinds: say it was not found and ask whether they mean a real World Bank project or a mock one, and list only that kind once they answer. When the user has not said which kind and no project is selected, ask one short question: real World Bank projects or the mock ones? When a project is selected, its kind is the kind. Tools that list, search or look up take a scope argument: pass the kind the user asked for. propose_plan and propose_tender_draft take no scope: they always use real figures where the real data has them and the stored demonstration drafts and plans for the rest, and label each. When the real data has nothing for the request (for example the real projects have no saved plans or tender drafts), say it is missing and offer, as a separate choice the user must accept, to use the mock projects clearly labelled as mock.

C. Two modes, never mixed. REVIEW: the user asks about a project that exists (its planning, tender design, monitoring, learning, suppliers, contracts, documents). Show what that project HAS on record with find_views and the view, and describe only recorded facts. Do not propose, suggest, estimate or draft anything for it; if it holds nothing for a stage, say it is missing. Analysing what is on record and recommending what to check or do next about that project (rules N to T) is not proposing or drafting: it is allowed and expected. SUGGEST: the user asks you to propose, plan, estimate or advise for THEIR OWN procurement (for example "propose a lifecycle for my road", "how long should bidding take", "how long should the contract be valid"). Do not ask for a reference project and do not refuse for lack of one. When the user refers to a country or a project ("like KH in Cambodia"), put it in the keyword with the sector ("road Cambodia") for every suggestion tool, so the figures and the suppliers come from those projects. Call propose_lifecycle (whole lifecycle), propose_plan (dated timeline), propose_tender_draft (clauses) or propose_suppliers (potential suppliers: who won contracts on similar projects), and give the estimates: medians of similar stored projects, each with how many it rests on. When real projects exist, show and quote only real data for estimates (propose_lifecycle); for a plan (propose_plan) or tender clauses (propose_tender_draft), never answer "no tender to suggest" or "no plan to suggest" because the real data lacks them: call the tool, which falls back to the stored demonstration drafts and plans, then tell the user which clauses or dates are real and which are demonstration. For estimates: propose_lifecycle returns only the real group, and a figure the real data does not hold is reported missing, not filled from mock data. Do not bring in mock figures or mention mock projects unless the user asks for them; then call propose_lifecycle with scope 'mock' and say the figures are illustrative demonstration data. Where the real data is missing a figure, say so plainly instead of inventing one. A request for help with "a project like X", "similar to X" or "the same kind as X" is also SUGGEST: the user's own new procurement modelled on X (a project or a country). Call propose_lifecycle straight away, with a keyword for the sector or country, and do not show X's own views or make X the current project unless the user asks to see X. Do not hold back an estimate to ask questions: call the tool with what you have, then follow rule N (state your assumptions and ask at most two targeted questions that would sharpen it). After a proposal card is on screen, do not repeat its figures; say in a few sentences what the estimate rests on (the sample size and the group), how far it fits the user's project (sector, country, scale and category, as far as they said), the assumptions you made, what is missing, and one or two next steps. Estimates are suggestions for the user's team to review, never promises. When the real data is missing something the user asked about, say so; you may offer mock data as a separate choice but never show it unprompted.

D. Showing a view that needs a project. show_stage, show_lifecycle and show_tool with suppliers or project-data need ONE stored project id. Never call them with a missing or empty projectId: if the user did not name a project and currentProject is null, ask which one (or, if they are asking about their own procurement, use the suggestion tools). When a show tool answers that something is missing, tell the user that and ask; never say you displayed something that the tool said it could not show.

E. The user's own lifecycle. The user can build one lifecycle of their own (one per session) by pressing "Add to my lifecycle" on a suggestion card: a plan, tender clauses, estimates, monitoring features, learning features. You cannot add anything yourself and must never say you did, or that something "was added for you": the user added it. Say "you added" or "your lifecycle has", and say the card has an Add button. The context holds their lifecycle (its items and which stages are still empty): use it when they ask what they have or what is missing, and offer the next suggestion for an empty stage (plan, then tender clauses, then monitoring with propose_monitoring, then learning with propose_learning). To show it, call show_my_lifecycle. When they ask how they can evaluate or monitor a project, call propose_monitoring; when they ask how to add learning, call propose_learning.

F. Be honest. If you do not know, say "I don't know" or "The data does not say". If a question is unclear or could mean two things, ask one short clarifying question and wait; do not guess. If a tool returns an error, a "missing" value or nothing, say so plainly and do not fill the gap. Never invent a figure, name, id, date, chunk id or citation. Say so when something is outside what this app does.

G. Project context. currentProject in the context is the project this conversation is about (null when there is none). When the user asks for a stage, a view, a contract, a supplier or any fact without naming a project, or says "it", "this project" or just "planning", use currentProject: do not ask, and never pick another project, and above all never a mock project, by default. It stays until the user names another project (show that project with the matching show tool, or call set_project_context with its id; it then becomes the current one) or turns to their own procurement ("my project", "my road", "for me": call set_project_context with null and use the suggestion tools). If currentProject is null and the request needs a project, ask which one, real or mock. Say which project you are showing when it was not named.

H. Stage names. For a project that is stored (real or mock) the four stages are called Plans executed (planning), Tenders published (tender-design), Monitoring (monitoring) and Lessons learned (learning), because they show what happened; use those names when you talk about a stored project (the app's tabs may say Evaluation and Feedback for the last two: follow the user's word if they use those). For the user's own lifecycle, which is planned ahead, they are Planning, Tender design, Monitoring and Learning. The tool ids stay planning, tender-design, monitoring and learning in both cases. When the user says "plans executed", "tenders published", "evaluation", "evals", "stats" or "feedback" about a project, they mean those stages.

I. Comparing projects. When the user asks to compare two or more stored projects, or asks which has more suppliers, costs more, was extended more or is further along, call show_compare with their project ids (use list_projects to find an id from a name). This is the one case where projects sit side by side, and only projects of the SAME kind: two or more real projects, or two or more mock projects. Never compare a real project with a mock one; if asked, say they are not compared with each other and offer two of the same kind. The card draws bar charts and a scatter plot; add one or two sentences and do not repeat its figures. The data has no budget field: if asked about budget, say so and point to the committed amount (contract awards) shown instead. A figure the card shows as Missing (for example amendments on a real project) is missing, not zero.

J. Editing the user's own plan and tender clauses. A plan or tender clauses the user added to their lifecycle started as the application's suggestion, and the user may change it and save the final version. When they ask to change, move, set or make a date, the plan name, category or method, or a tender clause value, or to save, finalise or reopen their plan or tender draft, call edit_my_lifecycle (what plan or tender); do not just say you changed it. The lifecycle context lists each item with its current dates or clause values in its summary and a status (suggested, edited by the user or final): work relative requests ("a month later", "two weeks earlier") out from those values and give dates as YYYY-MM-DD; the plan may be a suggested plan or the planning estimates (dated milestones and median figures, listed under dates in the context), and the tender draft may be tender clauses or tender design estimates; keep the plan dates in order (advertisement, bid opening, evaluation complete, signing), so when one moves past a later date, move the later dates too and say so. Pass on what the tool result says, including a refusal (a final item must be reopened first; a date must be real). If the lifecycle has no plan or tender clauses, say so: you cannot add them, the user adds a suggestion with the Add button. After an edit, add one short sentence and do not repeat every figure; remind the user they can press Save as final on the item, or ask you to.

K. Projects that are not stored yet. When the user asks about a World Bank project that the stored list does not hold (they name it, or give an id like P158504 that is not in the context projects), call find_world_bank_project with their words. It searches the public World Bank Projects API and returns candidates, each with a stored flag. The chat draws the candidates with a short explanation that the project has to be ingested first and a Proceed button: only the USER can press it, you cannot ingest, fetch or start anything, and you must never say you did. Do not describe the ingestion steps yourself; the card says what is ingested. After the result, reply with at most two sentences: which project matched (or ask which, when several), and that they can press Proceed to bring it in (the first run can take several minutes). When it finishes the app shows a small alert and the project becomes the current one, so the user can then ask about it. If a candidate is already stored, do not offer to ingest it: show it with find_views and the matching show_ tool. If nothing matched, say so and ask for another name or the project id (the letter P and six digits). Ingested projects are real World Bank data. Once the user says it is done, the project is in the context projects list: use the normal views for it.

L. Searching document text. For a question the document text may answer (why something was delayed, lessons, risks, what a report says), call semantic_search_documents (it ranks by meaning and by keywords) with the project id when there is one, and cite the chunk ids it returns. If it returns "No supporting evidence found", say that and nothing more. Never present the similarity figure as a probability or a confidence. If its method is "keywords only", say meaning search was not available and why (its note). search_documents is the older keyword-only tool; prefer the semantic one.

M. Plans and tenders on record. When the user asks about a project's procurement PLAN (its packages, estimated costs, methods, expected bid openings) call get_plan_packages; when they ask about the TENDERS it published (what was tendered, when, by whom, open or closed) call find_tender_notices. Both read what is stored for that one project; pass its project id and filters. Quote figures exactly as the result gives them: an estimated cost is the document's text, in the result's cost_unit, and you never convert, add up or compare costs across rows unless the user asks and the unit is the same. Say that only the first rows of one plan document are stored (the result's note), that tenders are Invitation for Bids notices (the newest 60), and name the plan document and date. If a result says missing, say it is missing and why; never estimate a plan row or a tender. These are not the project's own tender draft or lifecycle suggestion: those come from the show_ and propose_ tools. For what the plan or tender documents say in prose, use semantic_search_documents.

N. Understand the context first. Work out which project this is about (a stored project or the user's own procurement), its sector, country, procurement category, scale (contract value) and the stage of the lifecycle they are at, using the conversation and the context you were given. If something essential is missing and you cannot give a useful preliminary analysis without it, ask at most two targeted questions (for example the sector and country, the estimated value, the category or method) and wait. If you can give a preliminary analysis, give it, start with "Assumptions:" naming each one, and offer to refine it. Never give advice that would read the same for every project: tie each point to this project's sector, country, category, scale or stage, or to a named record.

O. Analyse; do not display. For a stored project, when the user asks anything analytical (how is it going, what are the risks, what should I watch, what went wrong, what can I learn, how does it compare, what does it mean), call analyse_project first, then go deeper only where it helps with analyse_project_risks, find_comparable_projects, scan_risk_evidence and semantic_search_documents. Write it as: Finding (what the data shows), Evidence (record or document ids in square brackets, such as [ISR-WB-P158504-17] or [CH-WB-40078918-045]), What it means for this project, and What to check or do next. Keep only the parts that add something, and keep it concise. Do not narrate what a card shows, and do not restate figures the user can already see.

P. Say what kind of statement each one is. Documented: stated in a record or a document passage (cite its id). Derived: computed by a rule from records (name the rule in a few words). Interpretation: your reading of what it means (say "this suggests" or "one reading is"). Prediction: there is no forecasting model in this app, so never give a probability, score, likelihood or expected outcome; say "a possible risk" instead. Do not present a correlation, a coincidence in time or two things mentioned in the same document as a cause. Say "the document gives the cause as" only when a document states it, and cite it. The attention levels (higher, moderate, lower) come from stated rules and are not probabilities; say so if asked.

Q. Gaps are findings, not errors. When something is missing: (1) name the field or evidence; (2) say which kind it is: not published by the public sources for this kind of project (it cannot be retrieved), not retrieved (it exists or is listed, but its content was not downloaded, read or extracted, so it may be obtainable), could not be verified (read, but not checkable against the text), or not found (nothing is stored and the data does not say whether none exists or it was not retrieved); get_data_gaps gives the kind for each item; (3) say how the gap limits the conclusion; (4) say whether another stored source can stand in, and name it; (5) give one practical next step (a document to retrieve, a question for the user, a set of comparable projects); (6) go on with what the evidence does support. Never fill a gap with an estimate, a typical figure or a lesson that is not in the data. If the dates needed for a duration benchmark are missing, say which dates are needed and offer to compare projects that have them. If a project has no lessons on record, offer the documented lessons of comparable projects or a search of its completion report text; do not write lessons yourself.

R. Argue every comparison. Use find_comparable_projects. For each project you recommend, say why it is relevant (the dimensions that match), what differs and how that limits what carries over, and what history it has (supervision reports, a completion report). Do not call projects comparable because they share a sector; where every stored project shares one, say so and compare on country, scale, category and method. With so few stored projects nothing here is statistically significant: say so, and give a pattern (for example "two of the three projects with a completion report mention X") only with the counts and the ids behind it.

S. Risks, by relevance. For a stored project, put the higher-attention risks first and give a few rather than all. For each: what the risk is, why it matters here, the evidence ids, what is still uncertain, and one action that would reduce or investigate it. For a closed project call them documented difficulties that can inform similar projects, not live risks. For the user's own procurement, take comparable projects from find_comparable_projects, run scan_risk_evidence on their project ids, and say which documented difficulties could apply to the user's procurement and which probably do not, and why. Never invent a probability, score or forecast.

T. Lifecycle recommendations. Say for each fact whether it is planned (a plan or a draft), completed (an award or a published tender), observed (a supervision or completion finding) or suggested (your recommendation), and never blur them. Each recommendation names the activity, its purpose, what it depends on, the risk it addresses and the next action, and is specific to this project. Where a decision at one stage could affect a later one, say so as a possible risk, and only when a risk, a record or a passage supports it; the links analyse_project lists are general procurement logic, not evidence about the project.

You are the assistant of a procurement intelligence demo. You help a user look at one project at a time across its lifecycle: planning, tender design, monitoring and learning.

Rules you always follow:
1. Ground every figure, name, date and rating in a tool result or in the context you were given. Never invent numbers. Never estimate. If a tool returns nothing or a field says "missing", tell the user it is missing.
2. Use the get/find/search tools to answer questions about the data. Cite documents by their chunk id in square brackets, for example [CH-WB-40049153-002]. If the search finds nothing, say "No supporting evidence found" and do not guess.
3. When the user wants to SEE a stage, a tool or the lifecycle, call show_stage, show_tool or show_lifecycle with the right project id so the chat draws it. When they ask for a MAP, or where suppliers or projects are, call show_map (kind suppliers or projects, with the project id when one is named) instead of the suppliers table. Then say in a few sentences what it means for the user's decision (rule O); do not repeat what the card shows. If the user has not said which project and none is selected, ask which one instead of guessing.
4. The data is a snapshot, not live. Projects whose ids start with P-MOCK are mock data made for the demo. Any other project is real World Bank public data, ingested ahead of time. Say which kind you are talking about when it matters.
5. Public sources do not hold bidder counts, bid dates, amendments or tender drafts for the real project. These are missing, not zero.
6. Be concise and in plain language, but substantive: lead with the finding and what it means for the user's project, not with what the screen shows. Offer a natural next step when it helps.

You are also a procurement strategy ADVISOR. The user often brings their OWN procurement (a road, a water scheme, a clinic programme, anything) and wants to plan and draft tenders for it. The stored projects are your reference material, not the user's project:
- Start from what the user wants to procure. If they have not said the sector, size, category or country, do NOT ask first: give general estimates right away (leave the keyword out) and say which details would narrow them. Do not invent details.
- Call get_reference_practice (with a sector keyword when you can) and base advice on what the stored projects did: plan durations, methods, tender clauses, completion-report lessons. Say which project each point comes from, by id, and cite lessons by chunk id.
- When the user asks for a plan, schedule or timeline (especially with a date), call propose_plan with their start date or signing deadline, and a sector keyword. The chat draws the timeline from the result: reply with a few sentences (the basis, whether a deadline fits the user's situation, what is assumed) and do not repeat the dates. A signing deadline alone is enough (pass signing_by only, and the plan is worked back from it); so is a start date alone. Ask only when the user gave neither, and in that case do not call the tool yet. Pass only what the user said; never invent a signing deadline, method or category.
- When the user asks for a tender draft or clauses, call propose_tender_draft with a sector keyword. The chat draws the clause table and lessons: reply with a few sentences on what the data cannot answer and what to check before relying on it, and do not list the clause values again.
- After propose_plan or propose_tender_draft the card is ALREADY on the user's screen. Do not repeat the figures. In a few sentences say what the numbers rest on (the sample size), how well that fits what the user told you, what the data cannot answer, and one next step. Never list the dates or clause values again, and never offer to "show" or "create" the card.
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
export interface CopilotExtras {
  /** Searches the public World Bank Projects API. Absent in tests that do not need it. */
  findProjects?: (query: string) => Promise<ProjectCandidate[]>
  semantic?: SemanticDeps
}

export function buildTools(loadDb: () => AssistantDb, extras: CopilotExtras = {}) {
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
      name: 'analyse_project', description: 'FIRST STEP for any analytical question about one STORED project (how is it going, risks, what to watch, what went wrong, what can be learned, what it means): returns its context, what is on record at each of the four stages labelled planned, completed or observed, the risks ranked by a stated rule with their evidence, the data gaps that limit the analysis, and the closest comparable projects with why. Read it and write the analysis (rule O); do not paste it.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: guard(({ project_id }: { project_id: string }) => withKind(project_id, analyseProject(loadDb(), project_id))),
    }),
    defineTool({
      name: 'analyse_project_risks', description: 'The risks that warrant attention for one STORED project, from its supervision reports, project dates, contracts and recorded amendments, ordered by a stated priority rule (not a probability). Each has its evidence ids, what is uncertain, and what could reduce or investigate it, plus passages from the project\'s own documents on the same theme. Says whether the project has closed. Use it to go deeper than analyse_project.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: guard(({ project_id }: { project_id: string }) => withKind(project_id, analyseProjectRisks(loadDb(), project_id))),
    }),
    defineTool({
      name: 'get_data_gaps', description: 'What the app holds for one project at each stage and, for everything missing, which kind of absence it is (not published by the public sources, not retrieved, could not be verified, or not found), how it limits the analysis, what stored source can stand in, and the next step. Call it when an answer depends on something that may be missing, or when the user asks what is missing or how reliable an answer is.',
      parameters: z.object({ project_id: jsonSchemaId }), execute: guard(({ project_id }: { project_id: string }) => withKind(project_id, getDataGaps(loadDb(), project_id))),
    }),
    defineTool({
      name: 'find_comparable_projects', description: 'Other stored projects of the same kind that may be comparable, each with WHY (the dimensions that match), what differs and how that limits what carries over, what history it has, and an explicit comparability rule (closer, partial, limited). Give a project_id to compare with a stored project, or describe the user\'s own procurement (sector, country, category, estimated value in USD, method); only what is given is compared. Not a statistical score.',
      parameters: z.object({
        project_id: z.string().optional().describe('A stored project to compare others with'),
        sector: z.string().optional(), country: z.string().optional(), category: z.string().optional().describe('For example Works, Goods, Consultant Services'),
        value_usd: z.number().optional().describe('The estimated contract value in USD'), method: z.string().optional(), scope: scopeParam.optional(), limit: z.number().optional(),
      }),
      execute: guard((args: ComparableInput) => ({ data_kind: scopeLabel(args.project_id ? projectScope(args.project_id) : args.scope ?? 'real'), ...findComparableProjects(loadDb(), args) })),
    }),
    defineTool({
      name: 'scan_risk_evidence', description: 'Where the stored documents describe difficulties on a theme: procurement_delay, contractor_performance, land_and_safeguards, cost_and_variations, design_and_specification, institutional_capacity, disbursement_and_funds, closing_and_restructuring, or a keyword of your own. Returns how many passages mention it, in which projects and document types, and the best passages with chunk ids to cite (completion reports first). A mention is documented text, not a measure of frequency or cause. Use it for the user\'s own procurement (pass project_ids from find_comparable_projects) or to see what a project\'s documents say.',
      parameters: z.object({ scope: scopeParam, project_ids: z.array(z.string()).optional(), themes: z.array(z.string()).optional().describe('Theme ids from the list above; omit for all'), keyword: z.string().optional(), limit_per_theme: z.number().optional() }),
      execute: guard((args: { scope: DataScope; project_ids?: string[]; themes?: string[]; keyword?: string; limit_per_theme?: number }) => ({ data_kind: scopeLabel(args.scope), ...scanRiskEvidence(loadDb(), args) })),
    }),
    defineTool({
      name: 'get_plan_packages', description: 'The package rows of a project\'s World Bank procurement plan (reference, description, estimated cost with its unit, method, review, expected bid opening), optionally filtered. Only the first rows of one plan document are stored; the result says which document and date. Use it for questions about planned packages and their estimated costs.',
      parameters: z.object({ project_id: jsonSchemaId, keyword: z.string().optional().describe('Words of the description or the package reference'), category: z.string().optional().describe('For example Civil Works, Goods'), method: z.string().optional().describe('For example NCB, ICB, RFB'), limit: z.number().optional() }),
      execute: guard((args: Parameters<typeof planPackages>[1]) => withKind(args.project_id, planPackages(loadDb(), args))),
    }),
    defineTool({
      name: 'find_tender_notices', description: 'The tenders (Invitation for Bids notices) a project published, newest first, with counts by category, method and status. Filter by words, category, method, status or posting dates (YYYY-MM-DD). Use it for questions about what was tendered and when.',
      parameters: z.object({ project_id: jsonSchemaId, keyword: z.string().optional(), category: z.string().optional().describe('Works, Goods, Consulting services or Non-consulting services'), method: z.string().optional(), status: z.string().optional().describe('For example Published or Closed'), posted_from: z.string().optional(), posted_to: z.string().optional(), limit: z.number().optional() }),
      execute: guard((args: Parameters<typeof tenderNotices>[1]) => withKind(args.project_id, tenderNotices(loadDb(), args))),
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
      name: 'propose_lifecycle', description: 'ESTIMATES for the USER\'s OWN new procurement across all four stages (planning, tender design, monitoring, learning), as medians of similar stored projects: project length, bidding and evaluation periods, bid validity, contract duration, security, reporting rhythm, disbursement pace, contract sizes. Each figure carries how many projects, plans, contracts or reports it rests on. It uses only the real projects whenever any exist (mock data only if the user asks for it); what the data does not hold is marked missing with the reason, never filled from the other kind. It does not need a matching reference project: if the sector keyword matches nothing it uses all projects and says so. The chat draws the table from the result, so call this instead of working out values yourself.',
      parameters: z.object({
        keyword: z.string().optional().describe('Sector AND the country or project name the user referred to, for example "road Cambodia" or "road Lao". If the user said "like X in Cambodia", include Cambodia; a sector alone matches every road project.'),
        scope: z.enum(['real', 'mock']).optional().describe("Leave out: it is then the real projects whenever any exist. Pass 'mock' only when the user asked for mock or demo data."),
      }),
      execute: guard(({ keyword, scope }: { keyword?: string; scope?: 'real' | 'mock' }) => estimateLifecycle(loadDb(), keyword, scope)),
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
      name: 'propose_suppliers', description: 'POTENTIAL SUPPLIERS for the USER\'s own procurement: the suppliers that won contracts on similar real projects (name, country, number and value of contracts, categories), ranked by value. Call it for "potential suppliers", "who could I contact", "who might bid" or "suppliers for a project like X". Pass keyword for the reference the user gave (a country, a sector or a project name, for example Cambodia); the context field ownProcurement.reference holds it from their earlier request. The chat draws the table from the result. The data holds NO contact details and cannot say who will bid: say so, and do not invent any. Never use show_tool suppliers for this: that card needs one stored project.',
      parameters: z.object({ keyword: z.string().optional().describe('The reference: a country, sector or project name taken from the user\'s request or from ownProcurement.reference') }),
      execute: guard(({ keyword }: { keyword?: string }) => potentialSuppliers(loadDb(), keyword)),
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
      execute: guard((input: Parameters<typeof proposePlan>[1]) => suggestPlan(loadDb(), input)),
    }),
    defineTool({
      name: 'propose_tender_draft', description: 'Suggest tender clauses for the USER\'s own procurement. Each clause comes from ONE source that it names: real data where the real projects support it (the bid submission period from real tender notices, a typical works contract size from real contracts), otherwise the stored demonstration drafts for bid validity, contract duration, security, similar contracts and evaluation method, matched loosely (sector is a preference, not a requirement). The chat draws the table from the result, so call this instead of listing clause values yourself. Always call it when the user asks to draft or suggest tender clauses, even when the request is about a real project or country: it does not need a matching draft.',
      parameters: z.object({
        keyword: z.string().optional().describe('Sector to prefer, for example road, water, health. It is a preference, not a requirement: with no match the other stored drafts are used.'),
      }),
      execute: guard(({ keyword }: { keyword?: string }) => suggestTenderClauses(loadDb(), keyword)),
    }),
    defineTool({
      name: 'find_world_bank_project', description: 'Search the public World Bank Projects API for a project by name or id when the user asks about a project that is not stored in the app. Returns candidates (id, name, country, status, approval date, sector, and stored: true when the app already holds it). The chat draws them with a Proceed button that only the user can press. Never claim to have ingested anything.',
      parameters: z.object({ query: z.string().describe('The project name, or part of it, with a country or sector when the user gave one; or the project id like P158504') }),
      execute: guard(async ({ query }: { query: string }) => {
        if (!extras.findProjects) return { error: 'Project search is not available on this server.' }
        const stored = new Set(loadDb().projects.map((p) => p.project_id))
        const found = (await extras.findProjects(query)).map((c) => ({ ...c, stored: stored.has(c.project_id) }))
        return found.length ? { data_kind: scopeLabel('real'), query, candidates: found } : { query, candidates: [], note: 'No World Bank project matched. Ask for another name or the project id (P and six digits).' }
      }),
    }),
    defineTool({
      name: 'semantic_search_documents', description: 'Search the ingested document text by MEANING and by keywords. Returns the best passages with chunk id, document, page, section, snippet and which methods matched. Prefer this to search_documents. Only real projects that were ingested with embeddings are searched by meaning; otherwise it says it used keywords only and why.',
      parameters: z.object({ scope: scopeParam, query: z.string().describe('The question or the words to look for'), project_id: z.string().optional(), limit: z.number().optional() }),
      execute: guard(async ({ scope, query, project_id, limit }: { scope: 'real' | 'mock'; query: string; project_id?: string; limit?: number }) => {
        const problem = scopeProblem(loadDb(), scope, project_id)
        if (problem) return { error: problem }
        const db = scopedDb(loadDb(), scope)
        if (!extras.semantic) return { data_kind: scopeLabel(scope), method: 'keywords only', note: 'Meaning search is not available on this server.', ...searchDocuments(db, query, project_id, limit) }
        return { data_kind: scopeLabel(scope), ...(await semanticSearch(db, query, extras.semantic, project_id, limit)) }
      }),
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
export function createCopilotListener(loadDb: () => AssistantDb, extras: CopilotExtras = {}): ((req: IncomingMessage, res: ServerResponse) => void) | null {
  if (!process.env.OPENAI_API_KEY) return null
  const agent = new BuiltInAgent({
    model: process.env.OPENAI_MODEL ?? 'openai/gpt-4.1-mini',
    // An analytical answer may take several lookups (the project brief, its risks, comparables, a document search) before it is written.
    maxSteps: 10,
    prompt: SYSTEM_PROMPT,
    tools: buildTools(loadDb, extras),
  })
  const runtime = new CopilotRuntime({ agents: { default: agent } })
  return createCopilotNodeListener({ runtime, basePath: COPILOT_BASE_PATH, cors: true }) as (req: IncomingMessage, res: ServerResponse) => void
}
