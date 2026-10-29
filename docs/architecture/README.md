# How the project fits together

Written 2026-10-29 on branch `chatbot`, from the code at that time. If something here disagrees with the code, the code wins: fix this file.

This is the entry point for a new chat. Read it first, then the file for the part you are touching.

| File | What it explains |
|---|---|
| `README.md` (this file) | The whole system: pieces, how they talk, data, state, deployment, gotchas, how to work with K |
| `shell.md` | The host app: layout, routes, the chat page and every card in `apps/shell/src/chat/` |
| `planning-remote.md` | Micro front-end `planning` (port 5174) |
| `monitoring-remote.md` | Micro front-end `monitoring` (port 5175) |
| `learning-remote.md` | Micro front-end `learning` (port 5176) |
| `ai-remote.md` | Micro front-end `ai` ("Work with AI", port 5177) |
| `copilot-runtime.md` | The model-backed chat: runtime, tools, prompt, context, and the custom theme over CopilotKit |

Other documents that already exist, and what they are for:
- `claude.md` (repo root): the original project brief and non-negotiable rules (provenance, no invented numbers, citations, roles). Some parts are superseded by what was built since; the rules still apply.
- `context.md` (repo root): history and gotchas of the chat platform work, with a reading list.
- `docs/PROGRESS.md`: one block per piece of work (Block 1 to about 69), newest at the bottom. Search it to learn why something is the way it is.
- `docs/ARCHITECTURE.md`: the older architecture note (rubric mapping, API contract, ports). Still useful for the rubric table; this folder is more current for the chat.
- `docs/DEMO.md`: demo script and where to edit data live. `docs/adr/0001-micro-frontends.md`: why Vite and Module Federation.

## 1. What this is

A demo front end for an AI-assisted procurement intelligence platform, built on World Bank open data. The backend is mocked. The user talks to a chat; the assistant answers with cards (plans, tenders, monitoring charts, suppliers, a world map, estimated lifecycles) drawn by the micro front-ends. Data is seven real World Bank road projects (ingested snapshots) plus three mock projects (ids `P-MOCK-...`), and the two kinds are never mixed without saying so.

## 2. The pieces and how they connect

```
 Browser (Vite dev: http://localhost:5173)
 ┌─────────────────────────────────────────────────────────────────────┐
 │ shell  (host)                                                       │
 │   pages, chat cards, filter rail, Zustand store, QueryClient        │
 │   loads remotes over Module Federation:                             │
 │     planning :5174   monitoring :5175   learning :5176   ai :5177   │
 │   shared singletons: react, react-dom, react-router, react-query,   │
 │     zustand, @pi/data, @pi/events, @pi/config, @pi/ui, @pi/domain   │
 └──────────────┬───────────────────────────────┬──────────────────────┘
                │ REST (hooks in @pi/data)      │ AG-UI over HTTP (CopilotKit)
                ▼                               ▼
      json-server :3001                 assistant server :3002
      serves mock/db.json               /chat           rule-based assistant (fallback)
      (reads and writes the file)       /api/copilotkit Copilot runtime -> OpenAI
                                          reads mock/db.json on every request
```

On Vercel the same code runs differently: the built shell and remotes are static files (`dist-vercel`, remotes under `/remotes/<name>/`), `api/[...path].js` replaces json-server (in memory, from the seed), `api/chat.js` replaces `/chat`, and `api/copilotkit/[...path].mjs` plus `api/copilotkit.mjs` replace `/api/copilotkit`. See section 9.

Where the code is:

| Part | Folder |
|---|---|
| Host app | `apps/shell` |
| Micro front-ends | `apps/planning`, `apps/monitoring`, `apps/learning`, `apps/ai` |
| Shared code | `packages/ui`, `packages/domain`, `packages/data`, `packages/events`, `packages/config` |
| Mock REST API data | `mock/db.json` (generated), `mock/seed.ts`, `mock/seed-extra.ts`, `mock/ingested/*.json`, `mock/import-gppd.ts` |
| Assistant server | `server/index.ts`, `server/copilot.ts` |
| Vercel functions | `api/` (some files are generated, see section 8) |
| Ingestion of real data | `ingest/` (`ingest.ts`, `notices.ts`, `plans.ts`, `parse.ts`) |
| Build and generation scripts | `scripts/` |

## 3. Micro front-end architecture in short

- One host (`shell`), four remotes (`planning`, `monitoring`, `learning`, `ai`), built with Vite and `@module-federation/vite`.
- Each remote exposes modules in its `vite.config.ts` (`exposes`). Each exposed component is either a **page** (a whole screen, used by a route in the shell) or a **card** (a piece for the chat). The shell imports them with `lazy(() => import('planning/PlanningCard'))` and wraps them in `RemoteBoundary` (error boundary plus Suspense).
- Types for remote modules are declared by hand in `apps/shell/src/env.d.ts`. Adding an exposed module means: expose it in the remote's `vite.config.ts`, declare it in `env.d.ts`, **restart that remote's dev server** (a new exposed module is not picked up otherwise).
- Shared singletons (list above) mean one React, one router, one react-query client, one Zustand store and one event bus across host and remotes. A mutation in one remote invalidates queries in all of them.
- Remotes never import from the shell or from each other. They import `@pi/*` packages only. `packages/ui` and `packages/domain` must not import from apps.
- Ports: shell 5173, planning 5174, monitoring 5175, learning 5176, ai 5177, json-server 3001, assistant 3002. In dev each remote has its own origin; on Vercel they are served from `/remotes/<name>/` (the `DEPLOY=vercel` flag changes the remote entries and `base`).

## 4. Shared packages

| Package | Contains | Rule |
|---|---|---|
| `@pi/ui` | Design tokens (`tokens.css`), primitives: `Card`, `Button`, `Badge`, `ProvenanceChip`, `EmptyState`, `DataGate`, `Dialog`, `Select`, `DonutNav`, `Gantt`, `Calendar`, `ColumnChart`, `PairedBars`, `Paged`/`Pagination`, `Carousel`, skeletons, `InfoTip`, `TableScroll` | No imports from apps. The shared `Card` uses 12px side padding below 640px and 20px above. |
| `@pi/domain` | Domain components used by shell and remotes: `CitationChip`, `SourceDrawer`, `FeedbackWidget`, `DocumentDialog`, `ChatWindow` (the fallback chat's window), `MapCard` | No imports from apps. |
| `@pi/data` | Zod schemas (`schemas.ts`, the single source of types), the API client and TanStack Query hooks (`hooks.ts`), the Zustand stores (`store.ts`, `myLifecycle.ts`), pure selectors and helpers, and everything the assistant computes | Mostly pure functions with tests. Imported by the server too, so files the server uses must not import React or the hooks (import them by path, not through `index.ts`). |
| `@pi/events` | Typed event bus: `project:selected`, `fiscalYear:changed`, `role:changed`, `enrichment:saved`, `alert:assigned`, `feedback:submitted` | |
| `@pi/config` | Roles and permissions (`can`, `whyDisabled`), `THRESHOLDS`, fiscal-year helpers (`fiscalYearOf`, July to June), `API_BASE`, `ASSISTANT_BASE`, `COPILOT_URL`, `LIFECYCLE_STEPS` (Planning, Tender design, Monitoring, Learning), `PAST_STAGE_LABEL` (Plans executed, Tenders published, Evaluation, Feedback) | |

Key files in `@pi/data` (all under `packages/data/src/`):

| File | Job |
|---|---|
| `schemas.ts` | Zod schemas and types for every collection |
| `hooks.ts` | `useProjects`, `usePlan`, `usePlanPackages`, `useTenderNotices`, `useReports`, `useFeedback`, ... and the mutations (`useSavePlan`, `useSavePlanPackage`, `useReviewFeedback`, ...). Every write also appends to `audit_log` and invalidates all queries. |
| `store.ts` | `useUiStore` (see section 6) and `useCurrentUser()` (the auth seam: role only, no real login) |
| `myLifecycle.ts` | `useMyLifecycle`: the user's own lifecycle, saved in `sessionStorage` |
| `assistant.ts` | The rule-based assistant (`detectIntent`, `answer`, `Block` schema). Used only by the fallback chat. Its generated copy is `api/_lib/assistant.js`. |
| `assistantData.ts` | Pure lookups the model's server tools call (`listProjects`, `queryContracts`, `searchDocuments`, `referencePractice`, ...) |
| `scope.ts` | Real versus mock: `projectScope`, `scopedDb`, `scopeProblem`, `matchProjects` (keyword match word by word) |
| `viewRegistry.ts` | The single list of views the chat can draw, with keywords; `findViews` ranks them |
| `lifecycleEstimate.ts` | Median estimates for a new procurement (real data only unless asked) |
| `tenderSuggestion.ts` | Suggested tender clauses and plans with real-first, demonstration fallback, each clause labelled |
| `potentialSuppliers.ts` | Suppliers that won contracts on similar real projects |
| `estimateTimeline.ts` | Anchors planning estimates to a project completion date (default 10 years from today) |
| `lifecycleOptions.ts`, `exampleProject.ts` | Monitoring and learning features a user can add; the example project used to draw them |
| `suggestedPrompts.ts` | The starting chips, built from the stored projects |
| `mapMarkers.ts` | Turns contracts and projects into country markers for the map |
| `ai.ts`, `retender.ts`, `spec.ts`, `supplier.ts`, `schedule.ts`, `stages.ts`, `glance.ts`, `selectors.ts` | Pure helpers behind the older pages and cards |

## 5. How a chat message flows (model chat)

1. The user types in `CopilotChat` (CopilotKit's React chat) inside `CopilotPanel` (`apps/shell/src/chat/CopilotPanel.tsx`).
2. CopilotKit posts to `COPILOT_URL/agent/default/run` (the assistant server, port 3002) with the messages, the frontend tool definitions and the context (current project, projects list, the user's lifecycle, the reference).
3. The server's `BuiltInAgent` (OpenAI, default `gpt-4.1-mini`) runs a loop of up to 6 steps with the system prompt in `server/copilot.ts`. It may call **server tools** (they run on the server against `mock/db.json`) and **frontend tools** (they are sent back to the browser).
4. The browser executes frontend tools (`show_stage`, `show_tool`, `show_map`, `set_project_context`, ...) and draws their `render` output: the cards. Server tools that draw (`propose_*`) are rendered with `useRenderTool` from their JSON result.
5. The cards read live data with the same hooks as the rest of the app, so an edit or a new feedback shows everywhere.

Details, the tool list and the theme are in `copilot-runtime.md`.

The chat has two modes of operation:
- **Model chat** (needs `OPENAI_API_KEY` on the assistant server): the flow above.
- **Rule-based fallback** (no key, server down, or probe fails): `useCopilotAvailable` probes `COPILOT_URL/info`; when it fails, `Home.tsx` shows `ChatWindow` driven by `useAssistantChat` against `POST /chat` (`assistant.ts`, regex intent detection). The page then shows "Model chat unavailable: <reason>". The lifecycle bubble, My lifecycle and the suggestion tools exist in the model chat only.

## 6. State

| State | Where | Notes |
|---|---|---|
| Server data | TanStack Query (one `QueryClient`, created in `apps/shell/src/bootstrap.tsx`) | Remotes use it through the shared singleton |
| UI state | `useUiStore` (`@pi/data`, Zustand) | `projectId` (the filter's project, default `P-MOCK-001`), `chatProjectId` (the project the conversation is about, null until one is shown; **this is what the model is told**), `referenceKeyword` (what the user's own procurement is modelled on), `fiscalYear`, `role` (saved in `localStorage`), the fallback chat's messages |
| The user's own lifecycle | `useMyLifecycle` (`@pi/data`) | One per browser session, in `sessionStorage`; items are `derived` (suggested) and keep their basis |
| Cross-remote events | `@pi/events` | |
| Roles | `useCurrentUser()` | Planner, Contract manager, Reviewer, Admin; permissions in `@pi/config`; a control a role cannot use is disabled with the reason, not hidden |

The filter's project (`projectId`) and the conversation's project (`chatProjectId`) are different on purpose: the first always has a value (a mock project by default); the second starts empty so the model never assumes a mock project.

## 7. Data

`mock/db.json` is generated by `pnpm reset-db` (`mock/seed.ts`): mock collections, GPPD country context, and every snapshot in `mock/ingested/*.json` merged in. json-server serves and edits it live; `pnpm reset-db` throws away live edits.

Collections (about 25): `projects`, `contracts`, `enrichments`, `amendments`, `contract_milestones`, `plans`, `plan_packages` (real procurement-plan rows), `tender_notices` (real tenders), `tender_drafts`, `supervision_reports`, `completion_reports`, `documents`, `chunks`, `country_years`, `governance`, `recommendations`, `alerts`, `feedback`, `audit_log`, `schedule_items`, `tender_history`, `source_links`, `ingestion_runs`, `sources`, `conflicts`, plus `meta` (`dataset_label`, `as_of_date`).

Real versus mock:
- Real projects are ingested World Bank snapshots (ids like `P158504`): Lao Road Sector Project 2, Lao National Road 13, Road Sector Project (Lao 2010), KH - Road Asset Management Project II (Cambodia), Vietnam Road Asset Management, Liberia Road Asset Management, Bihar Rural Roads (India). Mock projects are `P-MOCK-001..003`. `projectScope(id)` decides.
- Real data holds contracts, suppliers, documents and text chunks, supervision reports (some unparsed), the first rows of one procurement plan, and published tender notices. It does **not** hold bid dates, bidder counts, amendments, tender clauses (bid validity, security) or stage dates of a plan. Those are Missing for real projects; the app says so.
- Ingestion: `pnpm ingest P<id>` (project, contracts, documents, chunks, supervision reports), `pnpm ingest:notices P<id>...` (tender notices, no model), `pnpm ingest:plans P<id>...` (plan rows read by a model from `.env.local`, every row checked against the document text). Cache is `ingest/cache` (git-ignored). See `mock/ingested/README.md`.

Trust model (from `claude.md`): every value has a provenance chip (`public`, `entered`, `derived` with its sample size, `missing`); missing data shows an empty state, never an estimate; suggestions show their basis; mock data is labelled. One deliberate relaxation: suggestions (estimates, plan, tender clauses) are shown even from a thin sample, flagged "Thin sample", and tender clauses and plans may fall back to labelled demonstration data.

## 8. Generated files (do not edit by hand)

`pnpm build:chat` (`scripts/build-chat-function.mjs`) writes:
- `api/_lib/assistant.js`: the rule-based assistant as plain CommonJS, from `packages/data/src/assistant.ts`.
- `api/_lib/copilot.mjs`: the Copilot runtime (`server/copilot.ts` and the pure data files it imports) as one ES module, packages left external.

A test (`scripts/chatFunction.test.ts`) fails when either is stale. **After changing `server/copilot.ts`, anything it imports (`packages/data/src/{assistantData,scope,viewRegistry,lifecycleEstimate,lifecycleOptions,tenderSuggestion,potentialSuppliers}.ts`) or `assistant.ts`, run `pnpm build:chat` and commit the result.**

## 9. Deployment (Vercel)

- `vercel.json`: install `pnpm install --frozen-lockfile`, build `pnpm build:vercel` (builds all apps with `DEPLOY=vercel`, then `scripts/assemble-vercel.mjs` puts the shell at the root and each remote under `/remotes/<name>`), output `dist-vercel`.
- Functions are plain JavaScript or `.mjs` (a TypeScript function crashed earlier; CopilotKit has ES-only dependencies, so its function is an ES module and Node is pinned to 22.x in `package.json`).
- `/api/copilotkit/...` is rewritten to `/api/copilotkit?path=...` and `api/copilotkit.mjs` puts the path back, because Vercel did not route multi-segment paths to the catch-all file.
- Environment variables on the Vercel project: `OPENAI_API_KEY` (needed for the model chat; Preview and Production are set separately), optional `OPENAI_MODEL` (provider-prefixed, e.g. `openai/gpt-4.1-mini`), optional `COPILOTKIT_TELEMETRY_DISABLED=true`.
- Without the key the runtime answers 404 and the page falls back to the rule-based chat, with the reason shown.
- Function data comes from the bundled seed `mock/db.json` (edits are not shared between invocations or sessions).
- Preview deployments are behind Vercel Authentication (curl gets 401; open them in a browser).

## 10. Running and checking

```
./run.sh dev      # json-server :3001, assistant :3002, shell :5173, remotes :5174-5177, hot reload
./run.sh          # reset data, build, serve the production build (use to present)
./run.sh keep     # like the default but keep the current mock/db.json
pnpm reset-db     # regenerate mock/db.json from the seeds and snapshots
pnpm assistant    # assistant server alone (reads .env.local)
pnpm -r typecheck
pnpm test         # vitest, about 200 tests (jsdom by default; files starting with // @vitest-environment node run in node)
pnpm build:chat   # regenerate api/_lib files
```

`.env.local` (git-ignored; copy `.env.example`): `OPENAI_API_KEY`, optional `OPENAI_MODEL`. The assistant server reads it only at startup, so restart it after changing it or `server/copilot.ts`. Never ask for, print or commit the key.

## 11. Gotchas learned the hard way

- **Blank page "does not provide an export named ..."** after adding an export to `@pi/data`, `@pi/config` or `@pi/ui`: the dev server keeps a stale export list. Restart the shell dev server (and the remote that imports it).
- A new exposed module needs a restart of that remote's dev server.
- Port 5173 may be the **production build** from `./run.sh`; it does not show source changes until rebuilt.
- Do not import `packages/data/src/index.ts` from server code (it pulls in React hooks); import the pure files by path.
- In the browser pane, animations pause when the pane is hidden, so screenshots can show half-faded modals; wait and take another.
- `apps/*/.mf/diagnostics/latest.json` changes on every build; it is noise, do not commit it.
- CSS grids that hold cards need `grid-template-columns: minmax(0, 1fr)`, or a wide table pushes the whole card past the screen.
- CopilotKit's CSS variable names (`--primary`, `--muted`, `--border`) clash with ours; see `copilot-runtime.md`.
- Models are not deterministic. Rules in the prompt make the right behaviour likely, not certain; where it must be certain, the app does it in code (for example clearing the project context after a suggestion).

## 12. How to work with K (the user)

- Commit and push **only when K says so** ("commit and push"). Conventional-commit messages (`feat(chat): ...`). **No `Co-Authored-By` or "Generated with Claude Code" lines.** Stage specific files; leave other people's work-in-progress and `.mf` noise out.
- Do not kill servers unless necessary, and say so when you do. Restarting only what changed is normal.
- Ask before adding dependencies, changing the data model or adding scope; otherwise decide and say what you decided.
- Work step by step, stop after each step when K is reviewing, and report plainly what was verified and what was not.
- Keep every value data-bound; never invent a figure; label mock and simulated data.
- Add a block to `docs/PROGRESS.md` for each piece of work.
