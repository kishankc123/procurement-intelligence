# The shell (host app): `apps/shell`

Port 5173. The shell is the micro front-end **host**: it owns the page layout, the router, the single `QueryClient`, the chat page, and every card the chat draws. It loads the four remotes (`planning`, `monitoring`, `learning`, `ai`) over Module Federation. Read `README.md` first for how it connects to the rest.

## Layout and bootstrap

- `src/main.tsx` does `import('./bootstrap')` (so federation can initialise the shared singletons first). `src/bootstrap.tsx` creates the one `QueryClient`, wraps the app in `QueryClientProvider` and `BrowserRouter`, and imports the global styles: `@pi/ui` tokens (`@pi/ui/styles.css`) and CopilotKit's stylesheet (`@copilotkit/react-core/v2/styles.css`).
- `src/App.tsx`: `FilterRail` (left, collapsible; on phones a drawer that slides the page over), a header with the brand link, then `main` with `BackButton`, `Breadcrumbs` and `StepNav` (all hidden on the home page) and the routes. `FilterRail` holds three `Select`s: project, fiscal year, role (the demo role switcher; no sign-in).
- `src/RemoteBoundary.tsx`: error boundary plus Suspense for every remote. If a remote is not running, the user sees "<name> could not load" instead of a blank page.
- `src/stepColors.ts`: the CSS colour token of each of the four lifecycle stages.
- `src/env.d.ts`: **hand-written typings for every remote module the shell imports** (`planning/Planning`, `planning/PlanningCard`, `planning/PlanProposalCard`, `planning/EstimateTimelineCard`, `monitoring/Monitoring`, `monitoring/ScheduleCard`, `monitoring/MonitoringCard`, `monitoring/MonitoringFeature`, `learning/Learning`, `learning/LearningCard`, `learning/LearningFeature`, `ai/WorkWithAI`). Keep it in step with each remote's `exposes`.
- `vite.config.ts`: `name: 'shell'`, `remotes` with one entry per remote (`http://localhost:<port>/remoteEntry.js` in dev, `/remotes/<name>/remoteEntry.js` when `DEPLOY=vercel`), and the shared singletons (`react`, `react-dom`, `react-router`, `@tanstack/react-query`, `zustand`, `@pi/data`, `@pi/events`, `@pi/config`, `@pi/ui`, `@pi/domain`).

## Routes (`App.tsx`)

| Path | Page | From |
|---|---|---|
| `/` | `pages/Home.tsx`: the chat page | shell |
| `/planning/*` | Planning page | `planning` remote |
| `/monitoring`, `/schedule` (redirects to it) | Monitoring page | `monitoring` remote |
| `/learning` | Learning page | `learning` remote |
| `/work-with-ai` | Work with AI page | `ai` remote |
| `/tender-design`, `/knowledge`, `/evidence`, `/project-data`, `/suppliers`, `/project` | `TenderDesign`, `Knowledge`, `Evidence`, `ProjectData`, `Suppliers`, `ProjectOverview` | shell (`pages/`) |
| anything else | `Planned` ("planned, not built") | shell |

The old full pages are still there and work, but the product is the chat: most of the later work happened in `pages/Home.tsx` and `src/chat/`.

## The chat page: `pages/Home.tsx`

- Landing: a hero with the lifecycle donut (`DonutNav` from `@pi/ui`) and the chat below it. When the user focuses the input or a message exists ("engaged"), the donut disappears and the chat grows. The hover box under the donut is hidden on touch screens.
- Which chat: `useCopilotAvailable()` (`chat/useCopilotAvailable.ts`) probes `COPILOT_URL/info`. If it answers, `CopilotPanel` (the model chat) is shown; if not, a note says why ("Model chat unavailable: ...") and the rule-based fallback is shown: `ChatWindow` (from `@pi/domain`) driven by `useAssistantChat` (`@pi/data`, posts to `/chat`) with `pages/AgentRun.tsx` drawing each reply (steps, text, then the cards).
- Starting prompts: `suggestedPrompts(projects)` (`@pi/data`) for the model chat; the fallback chat starts with the real project names first.
- `.landing` has bottom padding so the lifecycle bubble never covers the last line.

## `src/chat/`: the cards and the model chat

The model chat's UI. Each file below is one job.

| File | Job |
|---|---|
| `CopilotPanel.tsx` (+ `.module.css`) | **The model chat.** Provider, `CopilotChat`, frontend tools, render tools, context, suggestions, the project-in-context line, the lifecycle bubble. Fully described in `copilot-runtime.md`. |
| `ChatBlocks.tsx` | `BlockView`: draws a `Block` (`lifecycle`, `stage`, `tool`, `ready`) with a "Was this useful?" feedback widget. `BigDonut` (the lifecycle donut plus one tile per stage), `Stage` (a stage with its small donut: plans via `PlanningStage`, tender design via `TenderDraftCard`, monitoring and learning via the remote cards), `ToolView` (suppliers, project data, knowledge base, evidence). A stored project's stages are named with `PAST_STAGE_LABEL` (Plans executed, Tenders published, Evaluation, Feedback); donut clicks send a message that names the project ("Show evaluation for <name> (<id>)"). |
| `OnRecordCards.tsx` (+ css) | What a real project has on record: `PlanOnRecord` (the procurement-plan rows) and `TenderNoticesOnRecord` (published tenders). Same layout as the Planning stage's Plans list; rows open into details and an Edit button (`EditRowDialog.tsx`; role-gated with `edit_plan` and `edit_tender_facts`; saved rows are flagged `edited`). About five rows are visible and the rest scroll. |
| `TenderDraftCard.tsx` | Tender design for a project that exists: shows the saved draft read-only (or "no draft on record" with buttons), then the tenders. Its editor (`TenderDraftEditor`) opens only on "Edit" or "Enter a draft". |
| `ProposalCards.tsx` | Cards for the model's **suggestions** to the user's own procurement: `PlanProposal` (wraps the planning remote's `PlanProposalCard`), `TenderProposal` (clauses, each marked Real data or Demonstration, with lessons), `LifecycleProposal` (estimated lifecycle table, with "Add ... figures" buttons and a project-completion-date field for planning), `PotentialSuppliers`. |
| `MyLifecycle.tsx` | `AddToLifecycle` button, `FeatureOptions` (monitoring and learning options with Preview), `FeatureView`, `ItemView` and `MyLifecycleCard`: the user's own lifecycle as a donut that fills in as stages get items, with each item drawn by the remote's component (plan on the planning calendar, monitoring features as the monitoring remote's chart, schedule or early-warning board using an example project's data, learning features as the learning remote's queue or figures). |
| `LifecycleBubble.tsx` | A round button fixed to the corner (item count) that opens a modal with My lifecycle and, when a project is in context, that project's lifecycle. Buttons inside that ask the assistant send the message and close the modal. |
| `SuppliersCard.tsx`, `ContractsCard.tsx`, `KnowledgeCard.tsx` | Tool cards for one stored project (per-project suppliers, contracts, sources and documents). |
| `MapBlock.tsx` | Draws `MapCard` (from `@pi/domain`) for the model's `show_map` call: supplier countries or project countries; it maps countries, not sites; places come from the stored data. |
| `CardBoundary.tsx` | `CardBoundary` (a card that throws shows a message, not a blank chat) and `MissingInfo` (the "Missing information" card). |
| `useStageFacts.ts` | The one-line fact per stage shown on the lifecycle tiles (plans entered, plan rows read, tender notices, supervision reports, feedback). |
| `useCopilotAvailable.ts` | The probe described above. |

Rules the cards follow:
- Cards read data with `@pi/data` hooks; they hold no figures of their own.
- A card that needs a project and is given none draws nothing (the model is told, and asks). The `Card` wrapper in `CopilotPanel.tsx` also shows "There is no project with id X" for an unknown id.
- Provenance chips (`ProvenanceChip`) and "Thin sample" / "Demonstration" badges say what a figure is.
- Tables over five columns **stack on screens under 640px** (`data-label` plus a media query in each module CSS); the contracts table stays a sideways scroller with its first column pinned.

## Other pages in `pages/`

`Evidence.tsx` (conflict workbench, `EvidenceCard` is also used in the chat), `Knowledge.tsx` (source registry and documents), `ProjectData.tsx` (contracts with public columns locked and entered columns editable per role, amendments, audit trail), `Suppliers.tsx`, `ProjectOverview.tsx`, `TenderDesign.tsx` (draft editor, spec checks), `SpecGroups.tsx`, `ValidityCoverage.tsx`, `Planned.tsx`.

## How to add things

- **A new card for the model to draw:** build the component here (data from hooks); add a frontend tool in `CopilotPanel.tsx` (`useFrontendTool` with `render`) or, for a server tool's result, a `useRenderTool`; add an entry to `VIEWS` in `packages/data/src/viewRegistry.ts` with keywords (a test checks it); add a rule or tool description in `server/copilot.ts` if needed; run `pnpm build:chat`; restart the assistant server.
- **A new remote component for the chat:** expose it in the remote's `vite.config.ts`, declare it in `src/env.d.ts`, `lazy()` it inside `RemoteBoundary`, restart the remote.
- **A new filter or role rule:** `packages/config` (permissions) and `FilterRail.tsx`.

## Tests

Vitest with Testing Library: `chat/CardBoundary.test.tsx`. Most logic lives in `@pi/data` and is tested there. Components that load remotes cannot be unit-tested (the remotes do not resolve under vitest); they are checked in the browser.
