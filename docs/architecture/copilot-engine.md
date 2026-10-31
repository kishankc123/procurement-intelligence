# The Copilot engine: how it supports the chat, and how it brings in new projects live

Written 2026-10-31 from the code on branch `feat/ingestion`. If this disagrees with the code, the code wins: fix this file.

This explains what the "Copilot engine" is, how one chat turn runs through it, which chat features it supports, and how it ingests a project the app has never seen while the user watches. It is the current picture. `copilot-runtime.md` has the older detail of the runtime and the theme over CopilotKit; where the two differ (it lists 13 server tools and a 6-step limit, and one or two sentences after a card), this file is right.

Related: `docs/HOSTING.md` (setting up live ingestion on Vercel), `docs/ANALYST_STANDARD.md` (the analysis rules and how to check them), `docs/PROGRESS.md` (why things are as they are).

## 1. In one paragraph

The "engine" is CopilotKit's runtime with one model agent, running on the assistant server (`pnpm assistant`, port 3002) or as a Vercel function. The agent is an OpenAI model with a long set of written instructions and 22 tools that read the stored data. The chat in the browser (`CopilotPanel`) sends each message to it, lets it call tools, and draws our own cards from what the tools return. The same engine can find a World Bank project the app does not hold; it then offers the user a Proceed button, and pressing it runs an ingestion (fetch, parse, chunk, embed, publish) that the card follows live. When it finishes, the new project is in the data every tool reads, so the next question about it is answered like a question about any stored project.

## 2. The parts

```
 Browser (shell)                                                 Server (assistant server, or a Vercel function)
 ┌──────────────────────────────────────────┐                   ┌─────────────────────────────────────────────┐
 │ Chat page: asks "is the model chat on?"  │ GET /info         │ createCopilotListener  (null without a key) │
 │   no  -> rule-based chat (POST /chat)    │ ───────────────▶  │   CopilotRuntime                            │
 │   yes -> CopilotPanel                    │                   │    BuiltInAgent "default"                   │
 │ CopilotPanel                             │ POST /agent/      │     model  OPENAI_MODEL (gpt-4.1-mini)      │
 │  CopilotChat (messages, input)           │  default/run      │     instructions  SYSTEM_PROMPT (rules A-T) │
 │  frontend tools  (show_*, set_*, edit_*) │ ───────────────▶  │     server tools  (22, read the data)       │
 │  render tools    (draw a tool's result)  │                   │     maxSteps 10 tool rounds per turn        │
 │  context (3 entries)                     │ ◀─────────────────│  reads  mock/db.json  (+ ingested projects) │
 │ Cards: BlockView, IngestCard, proposals  │  SSE: text, tool  └─────────────────────────────────────────────┘
 └───────────────┬──────────────────────────┘  calls, results
                 │ REST (hooks in @pi/data)             Ingestion (section 6) uses the same server:
                 ▼                                       local   /ingest/*  (job runner, server-sent events)
        json-server :3001 / api/[...path].js             hosted  /api/ingest/*  (stateless steps, Vercel Blob)
```

Three kinds of tool, and who runs them:

| Kind | Runs in | What it is for | Examples |
|---|---|---|---|
| **Server tool** | the engine (server) | Looks something up or computes it from the stored data and returns facts the model reads. Defined with `defineTool` and a zod schema in `server/copilot.ts` | `find_contracts`, `analyse_project`, `find_world_bank_project` |
| **Frontend tool** | the browser | The model asks the browser to do or draw something; the handler runs in the page and the result goes back to the model as a sentence | `show_lifecycle`, `show_stage`, `show_map`, `set_project_context`, `edit_my_lifecycle` |
| **Render tool** | the browser | Draws a server tool's result as one of our cards, so the model does not have to retell it | `propose_*` cards, the ingest card for `find_world_bank_project` |

Context: three entries the browser adds to every turn (`useAgentContext` in `CopilotPanel.tsx`): which project the conversation is about and the list of stored projects with their kind (real or mock); the user's own lifecycle; and what the user's own procurement is modelled on. This is how "it", "this project" and "the planning" work without the user naming a project.

## 3. One chat turn

1. The user types, or presses a button in a card. A button does `useSendToChat`: it adds a user message to the agent and starts a run, exactly as if typed. (It must ask for the agent each time the card draws: while the chat is still connecting, CopilotKit hands out a placeholder agent, and a copy taken early points at it. Block 61 in `PROGRESS.md`.)
2. The browser posts the messages, the frontend tool definitions and the context to `/api/copilotkit/agent/default/run`.
3. The runtime calls the model with the instructions, the tools and the conversation.
4. The model replies with text, tool calls, or both. A **server tool** call runs in the engine and its result goes back to the model. A **frontend tool** call is streamed to the browser, which runs it and returns the outcome. This repeats, up to 10 rounds (`maxSteps`), until the model answers in text.
5. The answer streams back as server-sent events (AG-UI protocol). The browser shows text as it arrives and draws a card for each frontend or render tool call.
6. The chat scrolls to the newest message (`chatScroll.ts`), which CopilotKit alone does not do once the reader has scrolled up.

Every tool is wrapped in `guard()`: a tool that throws answers with a sentence ("The tool failed (…). Tell the user it failed and do not guess") instead of ending the run. Project-level results carry `data_kind` (real World Bank data or mock demonstration data), so the model can say which it is talking about and never mixes them.

## 4. What the engine supports

| The user asks for | The engine does | The user sees |
|---|---|---|
| A stage, a tool or a lifecycle of a stored project ("show the monitoring for X") | `find_views` picks the view; the model calls `show_stage`, `show_lifecycle`, `show_tool`, `show_map` or `show_compare`; the browser draws it from live data | The card, then a few sentences on what it means |
| Facts about a stored project (a number, a supplier, a date) | `get_project_overview`, `find_contracts`, `get_supervision_reports`, `get_plan_packages`, `find_tender_notices` | A short answer with ids |
| **Analysis** (risks, what to watch, what went wrong, how it compares, what is missing) | `analyse_project` first, then `analyse_project_risks`, `find_comparable_projects`, `get_data_gaps`, `scan_risk_evidence`, `semantic_search_documents` | Finding, evidence ids, what it means for this project, what to check next; gaps named by kind |
| Help with the user's **own** procurement | `propose_lifecycle`, `propose_plan`, `propose_tender_draft`, `propose_suppliers`, `propose_monitoring`, `propose_learning`; median estimates from the stored projects with sample sizes | Proposal cards with an Add button; the model cannot add for the user |
| What documents say | `semantic_search_documents` (by meaning where vectors exist, plus keywords; a floor of 0.30 similarity unless a keyword matches) or `search_documents` (keywords only) | Passages with chunk ids; "No supporting evidence found" when nothing qualifies |
| Editing the user's own plan or tender clauses | `edit_my_lifecycle` runs in the browser with the same checks as the forms | The change on screen, or why it was refused |
| **A project the app does not hold** | `find_world_bank_project` searches the World Bank Projects API | The ingest card (section 5) |
| Without a model | The rule-based assistant at `POST /chat` (no key, or the server cannot be reached) | The same cards, answered by rules |

How the engine behaves is decided by the written instructions in `SYSTEM_PROMPT`, in two layers: lettered **guardrails** (A to M: show the view, real versus mock never mixed, review versus suggest, honesty, project context, stage names, comparing, the user's own lifecycle, editing, finding a project, searching text, plans and tenders) and the **analyst standard** (N to T: understand the context first, analyse rather than display, label documented versus derived versus interpretation, treat gaps as findings with a kind, argue every comparison, rank risks by relevance, keep planned/completed/observed/suggested apart). `docs/ANALYST_STANDARD.md` states the rules and the checks. The analysis tools themselves are plain functions in `packages/data/src/analysis.ts`; they use no model and cite record and chunk ids. A test (`server/copilot.test.ts`) fails if the instructions name a tool that does not exist.

When the model chat is off (no `OPENAI_API_KEY`, or the probe `GET /api/copilotkit/info` fails or takes over 4 seconds), the chat page falls back to the rule-based chat. While the probe is running the page shows that rule-based chat, which is why it can appear for a moment before the model chat replaces it.

## 5. Real-time ingestion, from the user's side

1. The user names a project the app does not hold ("tell me about project P…" or a name).
2. The model calls `find_world_bank_project`. It searches the public Projects API and returns candidates, each marked `stored` or not. Instructions K forbid the model from claiming it ingested anything.
3. The browser draws the **ingest card**. It says the project must be ingested first (its record, contracts, documents, tenders and plan) and offers **Proceed**. Only the user can press it; there is no tool that starts an ingestion, so the model cannot.
4. On Proceed the card shows one line of loading text and a Cancel button. The stages are not drawn; they are kept in a collapsed "Details of this ingestion".
5. When it finishes, a small alert says the project's details are available, the card shows "is ready" with **Show details**, and the project becomes the one the conversation is about. A failure shows its reason on the card and in an alert, with **Try again**.
6. From then on every tool treats it like a stored project: "Show details" sends "Show the lifecycle for …", the analysis tools work on it, and its documents are searchable.

On the hosted site the card first asks for the ingest token (kept for the tab only) and says plainly when ingestion is switched off or the daily limit is used.

## 6. Real-time ingestion, how it runs

### 6.1 The pipeline (`ingest/pipeline.ts`)

One function, `ingestProject(projectId, options)`, used by the command line, the local server and the hosted function. It takes its network, cache and models as arguments (`PipelineIo`, an embedder, a plan reader), so tests run it on fixtures. It reports typed events as it goes; the card is a view of those events.

| Stage | Source | Model? | Result |
|---|---|---|---|
| find, project | Projects API | no | The project record |
| contracts | The contract index (hosted, or local if built), otherwise a scan of every page of the public contract list | no | The project's contract awards |
| notices | Procurement Notices API | no | "Invitation for Bids" tenders, newest 60, contact details never copied |
| documents | Documents API | no | The document list; it picks every supervision report, the newest completion report, the newest procurement plan, and lists the appraisal document and the completion review |
| texts | The documents' text links | no | Document text, four at a time. A refused or missing text (401, 403, 404, 410, 451) is skipped and recorded; any other failure stops the run |
| parse | Supervision report text | no | Ratings, risk, disbursement, restructurings, key dates (`ingest/parse.ts`) |
| plans | The newest plan documents | **yes** (`gpt-4.1-mini`, up to 3 calls) | Up to 15 package rows; a row is kept only if its reference, description and cost are found in the document text |
| chunk | Document text | no | About 1,500-character chunks with page and section |
| embed | OpenAI `text-embedding-3-small`, 512 numbers | **yes** | One vector per chunk (cap 3,000 chunks), stored as int8 |
| publish | | | The snapshot and vectors are saved (6.3) |

Without a key the plans and embed stages are skipped and say why; the rest still runs.

### 6.2 Two ways to run it

| | Local (`pnpm assistant`) | Hosted (Vercel) |
|---|---|---|
| Where the work runs | One background job in the server's memory, one at a time | Many short requests; nothing stays in memory |
| How the card follows | Server-sent events from `GET /ingest/:id/events`; a card that attaches late replays the run | The browser calls `POST /api/ingest/step` until the answer is `done` or `failed` (`paused` means call again; `busy` means wait) |
| Time limit | None | Each step works for up to 30 seconds (`INGEST_STEP_BUDGET_MS`), inside the function's 60-second limit |
| What carries work between requests | The file cache in `ingest/cache` | A cache in the Blob store (`cache/…`), including each paid embedding batch and each model reading of a plan |
| Contract awards | Scan of the whole list the first time (minutes), or the index if built | The contract index in Blob, built once with `pnpm ingest:index` |
| Who may start it | Anyone with access to the server | `INGEST_TOKEN`, a daily limit (5), and at most 3,000 chunks per project |
| Cancel | Stops the job | Stops the browser asking for more steps |

The pipeline can stop at a safe point when time runs out (`shouldPause`) and be started again; what it finished is in the cache, so the next call continues. A test checks that a run split into small pieces gives the same data as one uninterrupted run. The browser retries a step the host cut off (502, 503, 504) or turned away (429), because a step is safe to repeat.

### 6.3 Publishing, and how the rest of the app sees it

| | Local | Hosted |
|---|---|---|
| Saved | `mock/ingested/<id>.json` (snapshot), `mock/embeddings/<id>.json` and `.bin` | Blob: `ingested/<id>.json`, `embeddings/<id>.json` and `.bin` |
| Made visible | The snapshot is merged into `mock/db.json`, which json-server serves and the engine re-reads on every request | The data function (`api/[...path].js`) and the chat function merge new snapshots from Blob into their in-memory copy, at most every 5 seconds |
| In the browser | When the run ends the card refreshes every query, and once more 6 seconds later (another instance may not have synced yet) | Same |

The merge (`ingest/merge.ts`) replaces the project's own rows if it is run again, never duplicates a source, and keeps plan packages and tender notices from an earlier snapshot when the new run found none.

### 6.4 How the model chat reaches ingested data

Nothing special: the tools read the same data as the pages. After the merge, `list_projects` includes the project, `analyse_project` works on it, `semantic_search_documents` searches its vectors (loaded from the files, or from Blob when hosted), and the browser's project list (which `show_lifecycle` checks) refreshes as above. Until the browser's list has the project, a "show the lifecycle" request answers that the project was not found; asking again after a few seconds works.

## 7. Where the money goes

| Cost | Cause | Notes |
|---|---|---|
| Chat tokens | Every message resends the instructions (about 6,400 tokens), the whole conversation and every tool result (a project brief is about 3,000 tokens) | The biggest lever is a new chat per test; the cost grows with every message in one chat |
| Embeddings | One call per 100 chunks at ingestion; one per `semantic_search_documents` question | About $0.02 per million tokens; a typical project is a few thousandths of a dollar. Unchanged chunks are not paid for twice |
| Plan reading | Up to three calls of about 4,000 tokens at ingestion | Cached by document and text, so repeating a run does not repeat it |
| Search by name | `GET` to the World Bank Projects API | No token cost; 20 searches a minute are allowed |

## 8. Safety rules built in

- The model cannot ingest. Only a button the user presses starts a run, and the hosted site also needs the token.
- Only `https://*.worldbank.org` is fetched by the server; project ids must be `P` and six digits; store keys are validated.
- Real and mock data never mix: tools take a scope, comparisons stay inside one kind, results carry `data_kind`.
- Nothing is invented to fill a gap. A missing field is named, classified (not published, not retrieved, could not be verified, not found) and left missing. A plan row that is not found in its document is dropped.
- A refused or missing document does not stop a project; it is listed without text and noted.
- Past projects are view-only in the chat (`PAST_PROJECTS_EDITABLE` is false): no tender draft is created or edited for them.

## 9. Configuration

| Variable | Where | Effect |
|---|---|---|
| `OPENAI_API_KEY` | `.env.local`, or Vercel | Turns the model chat on, and enables embeddings and plan reading. Without it only the rule-based chat runs and ingestion skips those stages |
| `OPENAI_MODEL` | same | `provider/model`, default `openai/gpt-4.1-mini`. The plan reader uses it too when it names an OpenAI model |
| `ASSISTANT_PORT` | local | The assistant server port, default 3002 |
| `INGEST_TOKEN` | Vercel | Required for hosted ingestion; without it the site says ingestion is off |
| `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` | Vercel (set by connecting a Blob store) | Where hosted ingestion keeps everything. `INGEST_BLOB_ACCESS=public` if the store is public |
| `INGEST_DAILY_LIMIT`, `INGEST_STEP_BUDGET_MS`, `INGEST_MAX_CHUNKS` | Vercel | Defaults 5 runs a day, 30,000 ms, 3,000 chunks |

## 10. When something goes wrong

| What you see | Cause | What to do |
|---|---|---|
| The old chat shows for a few seconds, then the new one | The page shows the rule-based chat while it waits for `GET /info`; a cold function takes a few seconds | Normal; it is shorter when the function is warm |
| Only the rule-based chat, with "Model chat unavailable: …" | No key, or the probe failed or took over 4 seconds | Set `OPENAI_API_KEY`, restart `pnpm assistant`, check the reason shown |
| "Monitoring could not load … could not be fetched" | The feature app's files were not fetched (only the main app is running locally, or a deployment is incomplete) | Run `pnpm dev` at the repository root; on the hosted site reload and check the deployment. If the box says the app loaded and then hit an error, the Details show the cause |
| Buttons on a card do nothing | A click while the assistant is still answering, or a copy of the chat connection taken too early (fixed) | Wait for the reply; an alert now says "One moment" |
| "Ingestion is switched off" | `INGEST_TOKEN` or the Blob store is missing, or the contract index is not built | Follow `docs/HOSTING.md`; the status page `/api/ingest/config` gives the reason |
| "The ingest token is missing or wrong" | The typed token differs from `INGEST_TOKEN`, or the deployment predates a change | Retype it; redeploy after changing a variable |
| A document is listed "not available (HTTP 403)" | The World Bank site refused that text | Skipped by design; retried after a day |
| A step answers `paused` repeatedly | Normal for a large project; each step does what fits in 30 seconds | The card keeps asking; if it gives up after many steps, try again, since finished work is kept |
| A just-ingested project is "not found" in the chat | The browser's project list or the data function has not caught up | Wait a few seconds and ask again |

## 11. Testing without spending tokens

The pages open directly by URL and need no chat. Starting the server with an empty key (`OPENAI_API_KEY= pnpm assistant`) should switch the model chat off and use the rule-based chat, which draws the same cards for free. The analysis tools are plain functions covered by tests (`pnpm test`). Ingestion runs from the command line (`pnpm ingest P… --embed`). Use the model chat only for how answers read, and start a new chat for each test.

## 12. Where the code is

| What | File |
|---|---|
| The engine: instructions, tools, runtime | `server/copilot.ts` |
| Server entry: mounts the engine, `/chat`, `/ingest/*` | `server/index.ts`, `server/ingestRoutes.ts` |
| Search by meaning | `server/semantic.ts`, `packages/data/src/vectors.ts` |
| Tool logic (pure, tested) | `packages/data/src/assistantData.ts`, `analysis.ts`, `scope.ts`, `viewRegistry.ts`, `lifecycleEstimate.ts` |
| The chat in the browser | `apps/shell/src/chat/CopilotPanel.tsx`, `useSendToChat.ts`, `chatScroll.ts`, `useCopilotAvailable.ts` |
| The ingest card | `apps/shell/src/chat/IngestCard.tsx`, `IngestInChat.tsx`, `IngestViz.tsx`, `useIngestRun.ts`, `ingestClient.ts`, `apps/shell/src/toasts.tsx` |
| The pipeline and its pieces | `ingest/pipeline.ts`, `parse.ts`, `noticeRows.ts`, `planRows.ts`, `discover.ts`, `contractIndex.ts` |
| Running it | `ingest/jobs.ts` (local job runner), `ingest/hosted.ts` (hosted steps), `ingest/store.ts` (memory, files, Blob), `ingest/publish.ts`, `ingest/merge.ts` |
| Events shared by pipeline and card | `packages/data/src/ingestEvents.ts` |
| Vercel functions | `api/copilotkit/[...path].mjs`, `api/ingest/[...path].mjs`, `api/[...path].js`, and the generated `api/_lib/*` (rebuild with `pnpm build:chat`) |

## 13. What has and has not been checked

- The pipeline, job runner, hosted step handler, store, merge, analysis tools, the tool and instruction consistency and the ingest card have automated tests, run on fixtures and, for the analysis tools, on the stored projects.
- The hosted ingestion has been run for real by the project owner (a new project ingested on the deployed site).
- The written quality of the model's answers has not been measured; `docs/ANALYST_STANDARD.md` lists seven questions to check it.
- The scroll-to-new-message behaviour and the chat-connection fix are tested on their own, not inside the real CopilotKit chat.
- Cold-start timings on Vercel have not been measured here; the 2-second figure for the first `/info` call is from running the same function locally.
