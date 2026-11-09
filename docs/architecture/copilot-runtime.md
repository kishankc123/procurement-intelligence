# The Copilot runtime and the custom theme over it

> Partly superseded by `copilot-engine.md`, which covers the current tool set (22 server tools, up to 10 steps per turn) and live ingestion. Where the two differ, `copilot-engine.md` is right.

How the model-backed chat works end to end, and how our theme sits on top of CopilotKit. Versions at the time of writing: `@copilotkit/react-core` 1.83.0 (import from `/v2`), `@copilotkit/runtime` 1.83.0 (`/v2` and `/v2/node`), model `openai/gpt-4.1-mini` by default. Read `README.md` first.

Files: `server/copilot.ts` (runtime), `server/index.ts` (mounts it), `apps/shell/src/chat/CopilotPanel.tsx` and `CopilotPanel.module.css` (browser side and theme), `api/copilotkit*.mjs` and `api/_lib/copilot.mjs` (Vercel).

## 1. The picture

```
 CopilotPanel (browser)                               assistant server (:3002 or Vercel function)
 ┌───────────────────────────────┐   POST /api/copilotkit/agent/default/run   ┌──────────────────────────┐
 │ CopilotKitProvider            │ ─────────────────────────────────────────▶ │ createCopilotNodeListener │
 │  CopilotChat (UI)             │   body: messages, frontend tool defs,      │  CopilotRuntime           │
 │  frontend tools (show_*)      │         context entries                    │   BuiltInAgent "default"  │
 │  render tools  (propose_*)    │ ◀───────────────────────────────────────── │    OpenAI (OPENAI_API_KEY)│
 │  agent context (3 entries)    │   SSE stream (AG-UI events): text,         │    system prompt          │
 │  suggestions                  │   tool calls, tool results                 │    server tools (13)      │
 └───────────────────────────────┘                                            │    reads mock/db.json     │
        ▲ executes frontend tools, draws cards                                └──────────────────────────┘
```

The protocol is AG-UI over HTTP with server-sent events. Routes under the base path `/api/copilotkit`: `GET /info` (runtime info; our availability probe), `POST /agent/default/run` (a turn), `/agent/default/connect`, `/stop/...`, `/suggest`. `GET /threads` answers 403 (no caller identity configured; harmless, logged as a warning).

## 2. Server side: `server/copilot.ts`

- `createCopilotListener(loadDb)` returns `null` when `OPENAI_API_KEY` is not set (then `server/index.ts` keeps only `/chat`, the rule-based assistant). Otherwise:
  ```ts
  new BuiltInAgent({ model: process.env.OPENAI_MODEL ?? 'openai/gpt-4.1-mini', maxSteps: 6, prompt: SYSTEM_PROMPT, tools: buildTools(loadDb) })
  new CopilotRuntime({ agents: { default: agent } })
  createCopilotNodeListener({ runtime, basePath: '/api/copilotkit', cors: true })
  ```
  The model string is `provider/model` and the runtime builds the provider itself (OpenAI, with `OPENAI_API_KEY`; `OPENAI_BASE_URL` is honoured if set).
- `loadDb` re-reads `mock/db.json` on every request, so `pnpm reset-db` and live json-server edits show up without a restart. The prompt and tool list are read at startup: **restart `pnpm assistant` after editing `server/copilot.ts` or `.env.local`.**
- `server/index.ts` loads `.env.local` with `process.loadEnvFile`, mounts the listener for any path under the base path, and serves `POST /chat` (rule-based fallback), `GET /health`.
- Telemetry notice: CopilotKit's runtime telemetry is on by default; `COPILOTKIT_TELEMETRY_DISABLED=true` turns it off.
- Everything the tools return is built by **pure functions in `@pi/data`** (tested), imported by path (never through `index.ts`): `assistantData.ts`, `scope.ts`, `viewRegistry.ts`, `lifecycleEstimate.ts`, `tenderSuggestion.ts`, `potentialSuppliers.ts`, `lifecycleOptions.ts`. The model chooses and phrases; it does not compute numbers.
- `guard(fn)` wraps every tool so a thrown error becomes `{ error: "The tool failed (...). Tell the user ... do not guess" }` instead of ending the run. `withKind` adds `data_kind` (real or mock) to project-level results.

### Server tools (run on the server; `defineTool` + zod parameters)

| Tool | Parameters | Returns | Drawn by |
|---|---|---|---|
| `find_views` | `request` (the user's words) | Matching views from the registry with the tool and arguments that draw each; empty list means "no view" | (model reads it) |
| `list_projects` | `scope` real or mock | Projects of one kind | |
| `get_project_overview` | `project_id` | Counts, key dates, latest supervision rating, `data_kind` | |
| `find_contracts` | `project_id` + optional filters (supplier, category, method, dates, min amount, sort, limit ≤ 25) | Matches, total, rows | |
| `get_supervision_reports` | `project_id` | Ratings, risk, disbursement per report | |
| `get_reference_practice` | `scope`, `keyword?` | What stored projects did (tender draft clauses, plan gaps, method mix, lessons) | |
| `search_documents` | `scope`, `query`, `project_id?`, `limit?` | Best passages with chunk ids, or "No supporting evidence found" | |
| `propose_lifecycle` | `keyword?` (sector **and** country or project, e.g. "road Cambodia"), `scope?` | Median estimates per stage with sample sizes. **Real projects only** when any exist; `scope: 'mock'` only when the user asks | `LifecycleProposal` |
| `propose_plan` | start_date / signing_by / name / category / method / keyword | A dated plan from stored plans; falls back to labelled demonstration plans (real projects have no four-stage dates) | `PlanProposal` (planning remote) |
| `propose_tender_draft` | `keyword?` | Clause by clause: real values where real data supports them (bid submission period, typical works contract size), the rest from demonstration drafts, each labelled | `TenderProposal` |
| `propose_suppliers` | `keyword?` | Suppliers that won contracts on similar real projects, ranked by value; states there are no contact details | `PotentialSuppliers` |
| `propose_monitoring`, `propose_learning` | none | The monitoring or learning features the app has | `FeatureOptions` |

`scope` on the lookup tools (`list_projects`, `get_reference_practice`, `search_documents`) runs them on `scopedDb(db, scope)`: a copy holding only real or only mock records, so the two kinds cannot mix. `propose_plan` and `propose_tender_draft` deliberately take **no** scope (the model used to pass `real` and switch the fallback off).

## 3. The system prompt (`SYSTEM_PROMPT`)

It is a plain string in `server/copilot.ts`. Top section, "GUARDRAILS... override everything below", lettered rules:

| Rule | Says |
|---|---|
| A. Show the view, do not retell it | For anything the app has a view for, call `find_views`, then the tool it names. "Show/list/see X" gets the view, not `find_contracts`. After a view, one or two sentences, no repeating figures. Never say you displayed something unless a `show_*` or `propose_*` tool did. |
| B. Real or mock, never both | Ids like `P158504` are real, `P-MOCK-...` are mock. Real request: real only. Mock only on request. Never put mock and real figures side by side; do not compare them; ask which kind when unclear. One exception: plan and tender-clause suggestions for the user's own procurement use real figures where they exist and labelled demonstration data for the rest. |
| C. Two modes, never mixed | REVIEW (about a stored project): show what it has on record, propose nothing. SUGGEST (the user's own procurement, "a project like X"): call the proposal tools straight away without asking for a reference; keyword includes the country or project named; real only for estimates; report gaps as missing. |
| D. A view that needs a project | `show_stage`, `show_lifecycle`, `show_tool` suppliers or project-data need one stored project id; with none, ask (or use the suggestion tools). Pass on a tool's "nothing was shown". |
| E. The user's own lifecycle | The user builds it with the Add buttons; the model cannot add and must say "you added", never "I added". |
| F. Be honest | "I don't know"; one clarifying question when unclear; report tool errors and missing values; never invent a figure, id, date or citation. |
| G. Project context | Use `currentProject` for requests without a project; it stays until another project is named or the user turns to their own procurement. If null and needed, ask. |
| H. Stage names | Stored projects: Plans executed, Tenders published, Evaluation, Feedback. User's own: Planning, Tender design, Monitoring, Learning. Tool ids stay `planning`, `tender-design`, `monitoring`, `learning`. |

Then numbered grounding rules (1 to 6: ground in tool results, cite chunk ids `[CH-...]`, call show tools, mock versus real, missing public fields, short answers) and an "ADVISOR" section (start from what the user wants to procure; do not ask for details first; use the plan and tender tools; reply in at most two short sentences after a card; no legal advice).

Prompts are the soft layer: they make the right behaviour likely, not certain. Re-test with the real model after any edit (section 9).

## 4. Browser side: `CopilotPanel.tsx`

`CopilotPanel` renders `CopilotKitProvider runtimeUrl={COPILOT_URL} enableInspector={false} onError=...` around `Inner`. `onError` shows a red line above the chat ("The model could not answer: ...") because CopilotKit shows nothing when a run fails (wrong key, unavailable model).

`Inner` calls:
- `useCardTools()` and `useProposalTools()` (below), `useAgent` (to tell the page "engaged" once there are messages), `useAgentContext` three times, `useConfigureSuggestions`.
- It renders the **project-in-context line** with a Clear button, a "My lifecycle · N items" button, `CopilotChat`, and `LifecycleBubble` (modal).

### Frontend tools (`useFrontendTool`; run in the browser; the handler's string is the tool result the model sees; `render` draws the card)

| Tool | Parameters | Handler | Draws |
|---|---|---|---|
| `show_lifecycle` | `projectId` | selects the project (filter and conversation), says it is now in context | `BlockView` lifecycle donut |
| `show_stage` | `step`, `projectId` | same | `BlockView` stage |
| `show_tool` | `tool` (suppliers, project-data, knowledge, evidence), `projectId?` | for suppliers and project-data with no project: returns an error text telling the model to ask or use `propose_suppliers`; otherwise same as above | `BlockView` tool card |
| `show_map` | `kind` suppliers or projects, `projectId?` | validates the id | `MapBlock` |
| `show_compare` | `projectIds` (2 to 5) | validates the ids; refuses a mix of real and mock | `CompareProjectsCard` (`compareProjects` in `@pi/data`; bars and scatter from `@pi/ui`) |
| `show_my_lifecycle` | none | | `MyLifecycleCard` |
| `set_project_context` | `projectId` or null | sets or clears the conversation's project | nothing |

`open()` in `useCardTools` is the shared handler. It reads the project list through a **ref**, because tool handlers are registered once and a list captured then would be empty while projects load. An unknown id returns "There is no project with id X". A missing id returns the `NO_PROJECT` message (nothing was shown; ask; do not say anything was displayed). The `Card` wrapper draws nothing for a missing project id and a short notice ("There is no project with id X") for an unknown one.

### Render tools (`useRenderTool`; draw the result of a **server** tool)

`propose_lifecycle`, `propose_plan`, `propose_tender_draft`, `propose_suppliers`, `propose_monitoring`, `propose_learning`: each shows a "working..." line while running and the card when `status === 'complete'`, parsing the JSON result with zod (anything unexpected becomes an empty state, never a half card). Each is wrapped in `ForOwnProcurement`, which, **once per tool call** (a module-level `handledProposals` set stops a re-drawn card from firing again), clears the conversation's project and stores the reference keyword from the result. A suggestion is for the user's own procurement, so this is done in code and not left to the model remembering.

### Context (`useAgentContext`; sent with every run)

1. `currentProject` (id, name, kind; null when none) and `projects` (id, name, kind).
2. The user's own lifecycle: `describeLifecycle(name, items)`, with `stagesStillEmpty`.
3. `ownProcurement.reference`: what the user's own procurement is modelled on, taken from the last suggestion's keyword.

### Suggestions

`useConfigureSuggestions({ suggestions: suggestedPrompts(projects), available: 'before-first-message' })`: chips built from the stored projects (a request per country, "any other country", real projects, data sources, one mock project).

### Messages sent by cards

`useSendToChat()` adds a user message and runs the agent, so a click inside a card behaves like the user typing. Stage buttons name their project ("Show evaluation for <name> (<id>)").

## 5. Deterministic code around the model (what does not depend on the model)

- Scope separation (`scopedDb`) and keyword matching (`matchProjects`, word by word).
- View ranking (`findViews`) and the registry.
- Every number: estimates, plans, clauses, suppliers, maps come from tested pure functions.
- Clearing the project and storing the reference after a suggestion; refusing a card with no project; unknown-project notice.
- `Card` null cases, the error line, the availability probe and fallback.
- Role permissions on edits and on the review queue.

## 6. Availability and fallback

`useCopilotAvailable()` fetches `COPILOT_URL/info` (4 s timeout). 200 means the model chat; anything else shows "Model chat unavailable: <reason>" (the reason is the function's own error text, e.g. "The model is not configured (no OPENAI_API_KEY)") and the page uses the rule-based chat (`/chat`, `assistant.ts`). `COPILOT_URL` is `http://localhost:3002/api/copilotkit` on localhost and `/api/copilotkit` elsewhere (`packages/config`).

## 7. Hosting on Vercel

- `api/copilotkit/[...path].mjs` is an **ES module** function (CopilotKit's dependencies are ES-only and a CommonJS function failed with `ERR_REQUIRE_ESM`); it imports `api/_lib/copilot.mjs` lazily inside a try/catch so a load failure is reported as JSON, not a bare 500. Without `OPENAI_API_KEY` it answers 404 with an explanation.
- `api/copilotkit.mjs` re-exports it for the bare path, and `vercel.json` rewrites `/api/copilotkit/:path*` to `/api/copilotkit?path=:path*`; the handler restores the full URL from `?path=` so the runtime sees the real path. (Vercel did not route multi-segment paths to the catch-all file; `/info` has one segment and worked, `/agent/default/run` did not.)
- `api/_lib/copilot.mjs` is **generated** by `pnpm build:chat` (esbuild; packages external; ES module). Regenerate and commit after server changes; `scripts/chatFunction.test.ts` fails when it is stale.
- Node 22.x is pinned in `package.json`. The seed `mock/db.json` is bundled via `includeFiles`.
- Runtime logs retain only one hour on the Hobby plan; the Vercel MCP tools can read them when team access has been approved.

## 8. The custom theme over CopilotKit

CopilotKit ships a ready-made chat UI with its own stylesheet (`@copilotkit/react-core/v2/styles.css`, imported in `apps/shell/src/bootstrap.tsx`). We do **not** replace its components; we re-skin them from the outside so the chat follows the app's tokens (dark by default; light with `data-theme="light"`) without touching CopilotKit's code. All of it is in `apps/shell/src/chat/CopilotPanel.module.css`, scoped under `.panel`.

How CopilotKit is styled, and what we do about it:

1. **Its colours are CSS variables on `[data-copilotkit]`** (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--input`, `--ring`, `--radius`, fonts). We set those same variables, on the same element, to our tokens. The selector (`.panel :global([data-copilotkit])`) must be **at least as specific as CopilotKit's own**, or ours loses.
2. **Name clashes.** CopilotKit's `--primary`, `--border` and `--muted` have the same names as our tokens, so `--primary: var(--primary)` would point at itself and be invalid. First we copy our values to `--app-*` aliases on `.panel` (`--app-surface`, `--app-text`, `--app-muted-text`, `--app-bg`, `--app-border`, `--app-primary`, `--app-selected`, `--app-danger`, `--app-on-solid`, `--app-radius`), then map CopilotKit's variables to the aliases.
3. **Our cards live inside CopilotKit's element**, so they inherit CopilotKit's redefined `--muted` (a background colour there, our muted **text** colour). `.cards { --muted: var(--app-muted-text); text-align: left }` gives them our meaning back. Every card drawn by a tool is wrapped in `className={styles.cards}`.
4. **Hard-coded light colours.** The input pill (`.copilotKitInput`), its textarea and its placeholder carry light colours that CopilotKit only darkens under a `.dark` ancestor, so they are set explicitly from the aliases. (A comment in the CSS also mentions the suggestion chips, but there is no explicit rule for them: they follow the mapped variables and look right.)
5. **Message text uses Tailwind's typography plugin** (classes prefixed `cpk:prose`), which only turns light under `.dark`. We point its `--tw-prose-*` variables at our colours and set size (15px), line height, list markers, headings, inline code, and a max width of 72ch on assistant messages.
6. **User messages**: a solid primary-coloured bubble with white text, left-aligned.
7. **Alignment**: an earlier rule justified and hyphenated paragraphs; a later rule at the end of the file sets `text-align: left; hyphens: manual` (the later rule wins). Justified text with hyphens looked ragged on phones.
8. **Panel**: `.panel` is the bordered container (min-height 70vh, `overflow: hidden`), `.lcBar` the strip with the project-in-context line and the lifecycle button, `.problem` the red error line.
9. **Inspector off**: `enableInspector={false}` removes CopilotKit's dev inspector button.
10. **Responsive**: cards stack tables under 640px; the lifecycle bubble moves to 12px from the corner on phones; the page adds bottom padding so the bubble never covers the input.

To change the look: edit the variables in step 1 or the prose rules in step 5; to test, view the page in light and dark (`data-theme`) and at 375px. If a colour will not change, it is almost always a specificity or `.dark`-ancestor issue, not a missing rule.

What is **not** customised: CopilotKit's message list, input and suggestion components, scrolling and streaming behaviour (we use the stock `CopilotChat`). Cards come in only through `useFrontendTool` and `useRenderTool` `render`.

## 9. Testing the runtime

- Unit tests (fast, no model): `packages/data/src/viewRegistry.test.ts` (which phrase maps to which view), `scripts/scope.test.ts`, `lifecycleEstimate.test.ts`, `tenderSuggestion.test.ts`, `potentialSuppliers.test.ts`, `scripts/chatFunction.test.ts` (generated files up to date). `pnpm test`.
- With the real model (costs a few cents per run; uses the key in `.env.local`, never print it):
  1. Run a second server copy: `ASSISTANT_PORT=3010 pnpm assistant` (leave the user's server alone).
  2. POST a run to `http://localhost:3010/api/copilotkit/agent/default/run` with `{ threadId, runId, messages: [{ id, role: 'user', content }], tools: [<frontend tool definitions>], context: [<entries>], state: {}, forwardedProps: {} }` and read the SSE: `TOOL_CALL_START` / `TOOL_CALL_ARGS` show which tool and arguments the model chose; `TEXT_MESSAGE_CONTENT` is the reply. This checks prompt rules quickly.
  3. In the browser, type into the chat by setting the textarea with the native value setter, dispatching an `input` event, then a `keydown` Enter (React-controlled input); wait 20 to 30 seconds. The network log of `agent/default/run` shows the tool calls and their arguments.
- Things worth re-checking after a prompt change: "show the contracts" draws the card (not text); a request for a real project stays real; "like X in <country>" calls `propose_lifecycle` with the country in the keyword and leaves "No project in context"; "potential suppliers" draws `PotentialSuppliers`; a bare "planning" with no project asks which one; an unknown project id is said not to exist; the model says "you added", not "I added".

## 10. Known behaviour and limits

- The model is not deterministic: it may pick a different tool or keyword on another run. Where the result must be right, code enforces it (section 5).
- With no project in context, a bare request can make the model return to the last project discussed instead of asking; it says which project in the card.
- Plans and tender clauses mix real figures and labelled demonstration drafts on purpose (K's decision for the demo); estimates do not.
- Real projects hold no bid dates, bid validity, security or four-stage plan dates; the app says Missing and never invents them. Supplier contact details are not in the data.
- The runtime has no login: roles are a demo switcher; threads are not stored.
- The lifecycle bubble, My lifecycle and the suggestion cards exist in the model chat only, not in the rule-based fallback.

## 11. Checklist: adding to the model chat

- **A server tool**: add a pure function in `@pi/data` with a test; add `defineTool` in `buildTools` (zod parameters, a description that says when to call it and what it cannot do, `guard(...)`); add a `useRenderTool` and a card if it draws; add a `VIEWS` entry with keywords if it is a view; update the prompt only if a behaviour rule is needed; `pnpm build:chat`; restart `pnpm assistant`; test with the real model.
- **A frontend tool**: `useFrontendTool` in `CopilotPanel.tsx` with a handler that validates and returns a plain-language result, and a `render`; make the handler return an error string when it cannot show anything.
- **A prompt rule**: keep the lettering in order; check it does not contradict another rule (B and C interact); run the checks above.
- Restart the shell dev server when `@pi/data` or `@pi/config` gain an export.
