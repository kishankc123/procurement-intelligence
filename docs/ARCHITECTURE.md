# Architecture

Front-end-only demo of a Procurement Intelligence platform on a mocked backend. Status: shell, Planning, Monitoring and Learning are built, plus Project data and a thin Tender design page in the shell. Knowledge base and Evidence workbench are built in simple form as shell pages.

## 1. Big picture

```
                    Browser  http://localhost:5173
 ┌──────────────────────────────────────────────────────────────┐
 │ SHELL (host)  apps/shell                                     │
 │  layout · nav · filters · role switcher · routing            │
 │  owns the single QueryClient                                 │
 │  pages built in the shell: Project data, Tender design, Knowledge base, Evidence workbench    │
 │                                                              │
 │   lazy(import('planning/Planning'))   lazy(import('monitoring/Monitoring'))
 └───────────┬───────────────────────────────────┬──────────────┘
             │ fetch remoteEntry.js              │ fetch remoteEntry.js
   ┌─────────▼─────────┐               ┌─────────▼─────────┐        LEARNING :5176, AI :5177 (same pattern)
   │ PLANNING  :5174   │               │ MONITORING :5175  │
   │ exposes ./Planning│               │ exposes ./Monitoring
   └─────────┬─────────┘               └─────────┬─────────┘
             └──────────────┬────────────────────┘
                            ▼
   Shared singletons (one instance for everyone, via Module Federation)
   react · react-dom · react-router · @tanstack/react-query · zustand
   @pi/data · @pi/events · @pi/config · @pi/ui · @pi/domain
                            ▼
   json-server :3001  ←  mock/db.json  (seed.ts + import-gppd.ts)
```

## 2. How the pieces find each other

| Question | File |
| --- | --- |
| What does a remote publish? | `apps/<remote>/vite.config.ts` → `exposes` and `filename: 'remoteEntry.js'` |
| Where does the shell find remotes? | `apps/shell/vite.config.ts` → `remotes` (one line per remote) |
| Where is a remote mounted? | `apps/shell/src/App.tsx` → `lazy(() => import('planning/Planning'))` and a `<Route>` |
| Types for remote imports | `apps/shell/src/env.d.ts` |
| Failure isolation | `apps/shell/src/RemoteBoundary.tsx` (error boundary + Suspense per remote) |
| Why `main.tsx` only does `import('./bootstrap')` | Lets federation initialise shared singletons before any React code runs |
| Standalone run of a remote | `apps/<remote>/src/main.tsx` → `bootstrap.tsx` (own QueryClient) |

## 3. Shared state and communication

- **Server state:** TanStack Query. The shell creates the one `QueryClient`; remotes reuse it through the shared `@tanstack/react-query` singleton. Every mutation hook (`packages/data/src/hooks.ts`) calls `invalidateQueries()`, so a change in one screen refreshes all others. Each write also appends an `audit_log` row.
- **UI state:** Zustand store in `packages/data/src/store.ts`: `projectId`, `fiscalYear`, `role`. Remotes read it through `useUiStore()`. Role is persisted in `localStorage` (inside try/catch).
- **Auth seam:** all role reads go through `useCurrentUser()`. Replace its body with real auth later; no component changes.
- **Events:** typed bus in `packages/events` (`project:selected`, `fiscalYear:changed`, `role:changed`, `enrichment:saved`, `alert:assigned`, `feedback:submitted`), stored on `window.__piBus` so remotes share it. Emitted by the store and mutation hooks; no screen listens yet.

## 4. Packages

| Package | Contains | May import |
| --- | --- | --- |
| `@pi/config` | roles and permissions (`can`, `whyDisabled`), `THRESHOLDS`, `fiscalYearOf`, constants | nothing |
| `@pi/events` | typed event bus | config |
| `@pi/data` | Zod schemas (types), API client, query/mutation hooks, store, **pure selectors** | config, events |
| `@pi/ui` | tokens, ProvenanceChip, Card, EmptyState, DataGate, Button, Badge | nothing (Bit-swappable) |
| `@pi/domain` | CitationChip, SourceDrawer, FeedbackWidget | ui, data, config |

Rule: `ui` and `domain` never import from `apps/*`.

## 5. Trust model: provenance, gates, citations

- **Provenance chip** on every field: `public`, `entered`, `derived`, `missing` (text label always shown).
- **Minimum samples:** `gate(n, required)` plus `<DataGate>`. Thresholds live in `packages/config/src/index.ts` (`THRESHOLDS`). Below threshold the UI shows n, required n and an action, never an estimate. Example: Planning's restructuring and duration cards show 3 of 30.
- **Citations are structural:** every recommendation and alert carries `citations[]` (chunk or record). A recommendation with none renders as Withheld. Any chip opens the shared SourceDrawer.
- **Derived values** come only from pure functions in `packages/data/src/selectors.ts` (`plannedDurations`, `countryReference`, `tenderCoverage`, `deriveAlerts`, `tenderComparison`, `feedbackKpis`, ...), which are easy to test and to explain.

## 6. API contract (json-server, `mock/db.json`)

All collections support `?field=value` filters (for example `?project_id=` and `?fiscal_year=`).

| Collection | Used by | Writes |
| --- | --- | --- |
| `meta` (object) | shell banner, as-of date | seed only |
| `projects`, `contracts` | all screens | seed only (public data, read-only in UI) |
| `enrichments` | Project data, Monitoring, shell coverage meter | POST (pending), PATCH status |
| `amendments` | Project data, Monitoring | POST (pending), PATCH status |
| `plans` | Planning, Tender design | PUT |
| `tender_drafts` | Tender design | PUT |
| `supervision_reports`, `completion_reports` | Planning, Monitoring | seed only |
| `documents`, `chunks` | SourceDrawer, retrieval | seed only |
| `country_years` | Planning country context | seed only (real GPPD for RO, EE via `import-gppd.ts`) |
| `governance` | Monitoring | seed only (illustrative values) |
| `recommendations` | Planning, Evidence workbench | seed only |
| `sources` | Knowledge base | PATCH (simulated fetch) |
| `conflicts` | Evidence workbench | PATCH (resolve); resolving can also reject the linked `enrichments` row |
| `alerts` | Monitoring | PUT/POST assignee only. Alerts themselves are derived, not stored |
| `feedback` | Planning, Learning | POST, PATCH status and reason |
| `audit_log` | Project data, Learning | POST on every write |

`pnpm reset-db` rebuilds `db.json` from `mock/seed.ts`.

## 7. Cross-screen consistency (example)

Contract manager enters REF-004 end date (Project data) → `enrichments` row, status pending → Reviewer approves → `invalidateQueries()` → shell coverage meter goes 2 → 3 of 6, Monitoring's `deriveAlerts` now emits "Contract past its end date", SourceDrawer can show that record, audit trail has two new rows. No screen copies the data.

## 8. Ports and commands

| Service | Port | Command |
| --- | --- | --- |
| json-server | 3001 | `pnpm api` |
| shell | 5173 | `pnpm --filter @pi/shell dev` |
| planning | 5174 | `pnpm --filter @pi/planning dev` |
| monitoring | 5175 | `pnpm --filter @pi/monitoring dev` |
| learning | 5176 | `pnpm --filter @pi/learning dev` |
| ai (Work with AI) | 5177 | `pnpm --filter @pi/ai dev` |

Reset data: `pnpm reset-db`. Typecheck: `pnpm typecheck`. Demo build: `pnpm demo` (build + `vite preview` on the same ports).

## 9. Adding a new remote

1. Create `apps/<name>` (copy `apps/monitoring`), change the name and port in `package.json` and `vite.config.ts`, and expose `./<Page>`.
2. In `apps/shell/vite.config.ts` add it under `remotes`.
3. In `apps/shell/src/App.tsx` add a `lazy` import and a `<Route>` inside `<RemoteBoundary>`; add a `declare module` in `env.d.ts`.
4. Restart the shell dev server (federation config is read at start).

## 10. Rubric mapping (assessment dimension → what the UI shows)

| Dimension | Demonstrated by | Status |
| --- | --- | --- |
| Data ingestion and sources | Provenance chips, public vs entered split, GPPD normalisation (`import-gppd.ts`), source facts honoured (contract awards have no tender dates) | Partial: source registry with simulated fetch, document and chunk views |
| Knowledge graph | Consistent IDs across collections, citations linking claims to chunks and records | Graph view not built (IDs and citations are in place) |
| Risk models | Monitoring signals, disbursement-lag rule, derived KPIs; model cards are gated and labelled Simulated | Rules built; simulated model run not built (cards are gated) |
| Grounded retrieval | Citations on every claim, SourceDrawer, Withheld state when no support | Keyword assistant not built |
| Evidence conflict handling | Public vs entered kept apart, validation, review queue, conflict with rule applied and resolution | Built (one seeded conflict) |
| Continuous learning | Helpful / Not helpful → `feedback` → Learning queue and update log | Built: queue with Accept/Edit/Reject, derived KPIs, update log |
| Architecture | Module Federation, shared singletons, package boundaries, ADR 0001 | Built |

## 11. Known limits

- Mock data throughout (`P-MOCK-*`). Governance values are placeholders. Only 3 completion reports exist, so model cards stay gated.
- No real auth; roles are a demo switcher.
- Project data and Tender design live in the shell rather than remotes (2-day scope).
- `pnpm test` covers the selectors only; there is no Playwright test.

## 12. The AI remote

`apps/ai` (port 5177, federation name `ai`) exposes only `./WorkWithAI`. The shell lazy-loads it behind a `RemoteBoundary`, so if the AI remote is down, `/work-with-ai` shows "Work with AI could not load" and every other screen keeps working (checked by stopping :5177 alone). `pnpm preview` and `pnpm dev` use `--no-bail`, so one remote stopping does not stop the others. The page reads shared data through `@pi/data` hooks and the pure selectors in `ai.ts`, `retender.ts` and `spec.ts`; it owns no state of its own. Suppliers stays a shell page. The project schedule (Gantt) is a card inside the Monitoring remote (`apps/monitoring/src/ScheduleCard.tsx`); the old `/schedule` URL redirects to `/monitoring`. The top-bar button always reads "Work with AI". The page opens on a list of projects; selecting one sets the shared project (`setProject`) and shows the AI layers for it, with a Change project button to go back to the list.

## 13. Project overview

`/project` (shell page) summarises the selected project from Planning, Tender design, Monitoring and Learning data, with a link to each section. Plans, draft clauses and contract data readiness come from `@pi/data` hooks and selectors; the schedule is `monitoring/ScheduleCard`, exposed by the Monitoring remote and loaded behind a `RemoteBoundary`, so the Gantt chart has one implementation. Clicking a project name (Home table or Projects menu) sets the shared project and opens this page.

## 14. Planning addresses

The shell routes `/planning/*` to the Planning remote, and the remote owns the sub-routes (`apps/planning/src/Planning.tsx`): `/planning` and `/planning/full-details/:planId`. The remote links with absolute paths under `BASE = '/planning'`, so the same code works in the shell and standalone (its `bootstrap.tsx` mounts it at `/planning/*`). Vercel's catch-all rewrite already serves these deep links.
