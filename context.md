# Chat platform: context for a new thread

Read this first, then `CLAUDE.md` (project rules) and `docs/PROGRESS.md` (history, Blocks 1 to 42). Written on 2026-10-28 for K, who builds the front end.

## 1. The goal

The product is now a **chat-first procurement assistant**, not a dashboard with a chat bolted on. The user says what they want ("help me with one of the mock projects", "show me project data"). The assistant answers with short text plus **cards inside the conversation**: a donut to move between lifecycle steps, a plan timeline, a suggested tender draft, charts, an early-warning board, and so on. The existing dashboard pages are the raw material; they get re-presented as chat cards.

K's rule for the split of work: K is the **React developer**. The front end sends the user's message to a Node server and renders what comes back. Ingestion, scraping, models and data sources are the server's job, not the React app's. For now the server imitates those services from `mock/db.json`.

This work lives on the **`chatbot` branch** (based on `feat/ai-features`, which has the whole platform). K will deploy this branch separately, so it must stand on its own. Nothing here is committed unless K says so.

## 2. What exists today (on `chatbot`, uncommitted at the time of writing)

| Piece | Where | Notes |
| --- | --- | --- |
| Assistant server | `server/index.ts` | Plain Node, no new packages, port **3002**. `POST /chat` `{ message, history }`, `GET /health`. Reads `mock/db.json` on every request. Run with `pnpm assistant` (not `pnpm server`, which is a built-in pnpm command). `./run.sh` starts it. |
| Assistant logic | `packages/data/src/assistant.ts` (+ `assistant.test.ts`) | Pure and tested. `resolveProject` (id, then words in name, country, sector; asks when ambiguous; "one of the mock projects" takes the project with most contracts and says so). `answer` returns `{ reply, simulated: true, steps[], options[], dossier }`. Zod schemas for request and reply. |
| Client | `packages/data/src/assistantClient.ts`, `chat.ts` | `askAssistant`, `useAssistantChat()` (messages, pending, send). Conversation lives in the Zustand store (`chat`, `chatPending`), so it survives page changes. `ASSISTANT_BASE` is in `packages/config`. |
| Chat window | `packages/domain/src/ChatWindow` | Presentational: messages, suggestion chips, input. Driven by `ChatMessageView[]` with an `extra` slot for cards. No knowledge of the server, so any assistant (or CopilotKit) can drive it. |
| Agent run + ready card | `apps/shell/src/pages/AgentRun.tsx` | Plays the simulated service steps one by one (labelled **Simulated**), collapses them, shows the reply text, then "Your procurement solution is ready" with four stage tiles (counts from the dossier, zero shown as Missing) and buttons into the old pages. Setting the project for all screens happens when the run finishes. |
| Landing page | `apps/shell/src/pages/Home.tsx` | Chat first, the old donut below as "What the assistant sets up". |

The old pages still exist and work: Planning, Monitoring, Learning, Work with AI (federated remotes), and Tender design, Project data, Knowledge, Suppliers, Evidence, Project overview (shell pages). The chat's buttons currently navigate to them as full pages. **The next work is to stop doing that and render them as cards in the chat.**

## 3. Target experience (K's brief, in order)

1. **Ready message.** When the reply says the solution is ready, show the **big lifecycle donut** (the one from the old home page) in the chat. Clicking a step does not open a page; it continues the conversation with that stage. The big donut is also shown whenever the user asks for the whole timeline.
2. **Chat, not a web page layout.** Inside the chat there is **no top bar, no filter rail on the left, no breadcrumbs, no back arrow, no Projects/Tools menus**. Navigation is by the **small donut on top of each stage view** and by typing. The role switcher stays (small, in the chat header).
3. **Planning** (suggestive): show the **plan timeline** and the **number of plans** the assistant suggests/has for the project, plus the plans list. It reads as "here is what I found/suggest", not a management screen.
4. **Tender design** (suggestive): present a **suggested draft** (duration, bid validity, performance security, similar contracts, evaluation method). The user edits it in the card and presses **Save draft**; the saved draft stays as is, with all figures, and shows everywhere else.
5. **Monitoring**: three things only, for now: the **disbursement vs. time elapsed chart**, the **project schedule** chart, and the **early-warning board**.
6. **Learning**: learning from **user feedback**. Show the feedback queue and let users give feedback (Helpful / Not helpful) on assistant answers and cards, written to the same `feedback` collection.
7. **Other tools by request**: "show me project data", "knowledge base", "suppliers", "evidence workbench" each return a card (the evidence workbench only when asked). **Knowledge base** shows the **source registry** and the **documents list** only (no search box, no type filter). Clicking a document opens the full-screen `DocumentDialog` that already exists.
8. Keep the chat's own behaviour: a typed run log (simulated services), a typing state, an input with suggestion chips.

Decisions K made after the first version of this file (treat as settled):
- **Big donut vs small donut.** The **big donut** is shown in the chat in the ready message and whenever the user asks for the whole lifecycle or timeline ("show me the whole timeline", "all the stages"). Clicking a step answers with that stage's view. **Every stage view starts with a small donut on top** that lets the user toggle through all four stages (the small donut is the compact `DonutNav`, as in `StepNav`). Toggling sends a chat message for the other stage, like clicking the big one.
- **Evidence workbench**: build it now as a card, but **only when asked** ("show the evidence workbench", "conflicts"). Otherwise the chat offers just the four stages (Planning, Tender design, Monitoring, Learning) plus the other tools on request.
- **Role switcher**: it stays for now. Keep a small role control inside the chat interface (for example in the chat header), so edits are still gated by role; the rest of the filter rail (project and fiscal year selectors, menus) stays out of the chat view.
- Still open: whether the old dashboard pages stay reachable at all on this branch (current plan: keep the routes, hide them from the chat; remove later if K wants).

## 4. Proposed architecture

**Server decides what to show, React renders it.** Extend `AssistantReply` with typed **blocks**. Blocks carry ids, not figures; each card reads its numbers from the same React Query hooks as the old pages, so edits show everywhere and nothing is hard-coded.

```ts
type Block =
  | { type: 'ready'; dossier: Dossier }                 // text + big donut
  | { type: 'plan-timeline'; projectId: string }
  | { type: 'plans-summary'; projectId: string }        // count + list, paged
  | { type: 'tender-draft'; projectId: string }         // suggested draft, editable, Save draft
  | { type: 'disbursement-chart'; projectId: string }
  | { type: 'schedule-chart'; projectId: string }
  | { type: 'early-warning'; projectId: string }
  | { type: 'feedback'; projectId: string }
  | { type: 'project-data' | 'suppliers' | 'evidence'; projectId: string }
  | { type: 'knowledge'; projectId: string }            // source registry + documents
```

- `answer()` gets an **intent step** before `resolveProject`: "planning / plan" , "tender / draft", "monitor / alert / schedule / disbursement", "learning / feedback", "project data", "knowledge / documents / sources", "suppliers", "evidence / conflict". Keep it rule-based and tested. A message about a stage with no project chosen asks which project.
- **Chat cards** are React components in the shell (or `@pi/domain`) that wrap the existing building blocks in an "embedded" form: no page heading, no `StepNav`, no breadcrumbs. Reuse, do not copy:
  - Planning remote: `PlanAgenda` (timeline + calendar), `PlanList`. Expose card entry points from the remote (like Monitoring already exposes `./ScheduleCard`), e.g. `./PlanTimelineCard`, `./PlansCard`.
  - Monitoring remote: `DisbursementChart` is internal to `Monitoring.tsx`; split it out and expose `./DisbursementCard`, keep `./ScheduleCard`, add `./EarlyWarningCard` (urgent-first, "Show all" already built).
  - Learning remote: expose a `./FeedbackCard` (queue + Accept/Reject/Edit modal).
  - Shell: Tender design needs a **suggested draft** card (see below); Project data, Suppliers, Knowledge, Evidence are shell pages, so extract their main card into components.
  - Mount remotes through `RemoteBoundary` so one failing remote only breaks its card.
- **Donut in chat**: reuse `DonutNav` (`@pi/ui`). Big version in the ready message and on "show the timeline"; the compact version (`compact` prop) heads every stage card. Its `onSelect` should call `send("Show planning")`-style messages, not `navigate()`.
- **Suggested tender draft**: server/logic proposes values only from data (benchmarks from `tenderComparison`, the selected plan, similar contracts). Anything with no source is **Missing**, never a guess. Label the card **Suggested** and **Derived**. Saving uses the existing `useSaveTenderDraft`; a project with no draft starts from the suggestion and Save creates it (there is no "New draft" button today; this fixes that dead end).
- **Feedback**: attach `FeedbackWidget` to assistant messages with `targetId = CHAT-<messageId>` (Learning's `titleOf` needs a label for it). Learning shows it in the queue.
- **Actions in cards become messages**: opening a document, choosing a project from options, clicking a donut step all go through `send()` or open the existing dialogs, so the transcript stays the record of what happened.
- Keep `ChatWindow` presentational. Cards go in `extra`. Tall cards: the log already scrolls inside the chat window; consider a taller window or a full-height chat page once cards are large.

## 5. Rules that still apply (from `CLAUDE.md`)

1. Everything on screen is data-bound; no hard-coded figures, names or counts in components (suggestion chips and cards read from hooks).
2. Every field has provenance (public, entered, derived, missing) shown as a chip. Missing data is an empty state with an action, never an estimate.
3. Minimum-sample gates stay (`THRESHOLDS` in `@pi/config`).
4. Citations are structural; unsupported claims are Withheld. Anything simulated says **Simulated**; mock data says **Mock**.
5. Consistent IDs; a change on one screen shows on all others (single QueryClient, writes invalidate all and append to `audit_log`).
6. Roles and permissions still gate edits (`useCurrentUser`, `can`, `whyDisabled`). K wants the role switcher kept for now: put a small control in the chat header (same store value as the filter rail's role select).
7. React 19, TypeScript strict (no `any`), CSS modules + tokens, shadcn/Radix primitives already in `@pi/ui`. **Ask before adding a dependency** or changing the data model.

## 6. How to work with K

- Do not commit unless K says so. When K asks, give commit messages as **one copyable block**, conventional-commit style, **no Claude trailer / Co-Authored-By**, no "Generated with Claude Code" in PR text.
- Update `docs/PROGRESS.md` (new Block per change), keep `docs/DEMO.md` accurate, run `pnpm -r typecheck` and `pnpm test` (currently 81 tests pass), and **look at the running UI** before saying done.
- K reviews step by step: give a list of steps, do one, stop. K may say "pause".
- Do not kill K's servers unless necessary; say so when you must.
- Use the built-in Browser pane to verify. Radix needs real clicks; animations are slow in the pane.

## 7. Running it

```bash
./run.sh dev        # json-server :3001, assistant :3002, shell :5173, remotes :5174 to 5177 (hot reload)
./run.sh            # reset data, build, serve the production build (use to present)
pnpm reset-db       # restore seed data (mock/seed.ts + mock/seed-extra.ts)
pnpm assistant      # assistant server alone
pnpm -r typecheck && pnpm test
```

Gotchas learned:
- **After adding an export to a shared package** (`@pi/config`, `@pi/data`, ...), the Module Federation dev servers keep a stale export list and the app goes blank with "does not provide an export named ...". Restart the affected dev server (the shell restarts alone: `pnpm --filter @pi/shell dev`).
- `pnpm server` is a pnpm built-in. Scripts must not use that name.
- Radix menus/selects set `overflow: hidden` on `body`, which made the sticky bars scroll away; fixed in `packages/ui/src/tokens.css` (`html body[data-scroll-locked]`). Keep that rule.
- Build check: `pnpm build 2>&1 | grep -c "DTS.*Error"` should print 0. Preview servers serve built files; dev servers do not need a build.
- The Python on this Mac fails TLS to some sites; use Node for network checks. Do not spoof client names to get around a block.
- Dates: Bank fiscal year runs July to June (`fiscalYearOf` in `@pi/config`). The data date is `as_of_date` 2026-05-31 in `meta`.

## 8. Mock data in short

`mock/seed.ts` + `mock/seed-extra.ts` write `mock/db.json`. Three projects: **P-MOCK-001** (road, Romania; the full one: 32 contracts, 14 plans, 3 supervision reports, 1 tender draft), **P-MOCK-002** (rural water, Estonia), **P-MOCK-003** (urban health, Romania). 6 completion reports, 22 documents, 30 chunks, 16 feedback items, about 165 update-log entries. Gates are deliberate: bid validity benchmark unlocked (12 contracts), contract-end-date benchmark one short (9 of 10), bidders benchmark gated (7 of 10). Two end dates are already past, so two alerts exist at start.

## 9. Suggested build order (one step at a time, stop after each)

**Step 1 is done** (Block 43 in `docs/PROGRESS.md`): blocks protocol, intents, big donut in ready/lifecycle, small donut heading each stage view. **Step 2 is done** (Block 44): `PlanningCard` exposed from the Planning remote and shown in the chat's Planning stage. **Step 3 is done** (Block 47): `TenderDraftCard` with suggestions, Save draft, create path. **Step 4 is done** (Block 48): `MonitoringCard` (chart, schedule, early-warning board). **Step 5 is done** (Block 49): `LearningCard` and Helpful / Not helpful under each block. **Step 6 is done** (Block 52): tool cards, follow-up suggestions, missing-data fallbacks. Next is step 7, the polish (chat-only layout without the filter rail, role control in the chat header, DEMO.md script for the chat flow).

1. **Blocks protocol + intent routing** in `assistant.ts` (tests first), chat renders a generic card slot. Big donut in the ready message and on "show the timeline"; clicking a step sends a message; every stage block starts with the small donut.
2. **Planning card**: plan timeline + plans count/list from the Planning remote (new exposed card), small donut on the message.
3. **Tender draft card**: suggested values, editable, Save draft (also creates the first draft).
4. **Monitoring cards**: disbursement chart, schedule chart, early-warning board.
5. **Learning/feedback card** + feedback widget on assistant messages.
6. **Tool cards**: project data, knowledge (registry + documents, no search/filter), suppliers, evidence workbench (only when asked).
7. **Polish**: chat page layout (taller window, hide the old header on the landing), role control in the chat header, empty/error states, DEMO.md script for the chat flow, Vercel (see below).

## 10. Not done, parked on purpose

- **Real model and CopilotKit.** K has an OpenAI key and is open to CopilotKit if it lowers effort. Plan: keep our own tool functions on the Node server and our own `ChatWindow`; CopilotKit could drive the same window later. Ask before adding `@copilotkit/*`, `openai`, or a server framework. Keys go in a git-ignored `.env` on the server, never in the repo or chat.
- **Real data.** Researched and pinned. Three public World Bank APIs work without a key but send no CORS headers, so only the Node server can call them: Contract Awards (`datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005&resourceId=RS00005&type=json`, 21 fields that match our `contracts`, filters are ignored so the server must page with `top`/`skip` and filter itself), Projects (`search.worldbank.org/api/v2/projects`), and Documents (`search.worldbank.org/api/v3/wds?proid=...`, with a plain-text `txturl` for every document). Best project found: **P158504 Lao Road Sector Project 2** (94 contracts, 17 supervision reports, 1 completion report, 50 procurement plans, 1 appraisal document). The model would extract ratings, lessons and plans from the document text into our schemas with page citations. Public data does not hold tender drafts, bidder counts or amendments.
- **Vercel for this branch.** Done in Blocks 50 and 51: `api/chat.js` (plain CommonJS) runs the same logic as `server/index.ts` through the generated `api/_lib/assistant.js` and answers from the seed `mock/db.json`. After changing `packages/data/src/assistant.ts` run `pnpm build:chat` and commit the generated file (a test checks it). Keep the logic free of workspace imports. When a real model arrives, the key must be a Vercel environment variable read by this function (or a separately hosted server), never in the repo.
- The old Work with AI page (source link, ingestion, record linking, retender check, spec checks) is untouched. It could become chat cards later.
