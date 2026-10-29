# Micro front-end: `planning` (`apps/planning`, port 5174)

Federation name `planning`. Owns everything about **plans**: the Planning page, the calendar and timeline chart, the plans list, and the plan cards the chat draws. Read `README.md` first.

## Exposed modules (`vite.config.ts` → `exposes`)

| Module | File | What it is | Used by |
|---|---|---|---|
| `./Planning` | `src/Planning.tsx` (default export) | The whole Planning page, with its own routes under `/planning/*` | Shell route `/planning/*` |
| `./PlanningCard` | `src/PlanningCard.tsx` | The Planning **stage** as a chat card: one-line summary, the plan timeline (calendar) and the plans table, with edit and delete. Props: `{ projectId }` | `ChatBlocks.tsx` (`PlanningStage`), for projects that have saved plans |
| `./PlanProposalCard` | `src/PlanProposalCard.tsx` | A **suggested** plan for the user's own procurement drawn with the same timeline; says how many plans and which projects it rests on; it is derived, not saved. Props: `{ proposal: { plan, basis, deadline? } }` | `ProposalCards.tsx` (`PlanProposal`), `MyLifecycle.tsx` (plan items) |
| `./EstimateTimelineCard` | `src/EstimateTimelineCard.tsx` | The planning **estimates** (durations such as project length or bidding period) once anchored to a project completion date: a calendar with every milestone marked and a list saying where each date comes from; assumed dates are labelled. Props: `{ timeline: DatedPlanning }` | `MyLifecycle.tsx` (planning estimates) |

Types for these are declared by hand in `apps/shell/src/env.d.ts`. After adding an exposed module, **restart this remote's dev server**.

## What is inside

- `Planning.tsx`: the page. `PlanListPage` (index) and `PlanDetailPage` (`full-details/:planId`) via `react-router`. Components that others reuse: `PlanList` (the plans table, `compact` for the chat; rows open into a stage timeline; delete and edit are role-gated with `edit_plan`) and `EditPlanDialog`. The page also holds the country reference (GPPD indicator C5.1), the "Restructuring likelihood" and "Duration model" cards (both gated by `DataGate` and labelled Simulated or unavailable below the thresholds in `@pi/config`), country context, recommendations with citations and Helpful or Not helpful, and "Similar completed projects".
- `PlanAgenda.tsx`: the calendar plus agenda. Two months side by side on wide screens, one on narrow ones. `compact` stacks it for the chat. Click a stage in the list or on the calendar to highlight it in the other. Stages and gaps come from `packages/data/src/stages.ts`.
- `PlanningCard.tsx`, `PlanProposalCard.tsx`, `EstimateTimelineCard.tsx`: the chat cards above; they only show data worked out elsewhere (`@pi/data`), they do not compute plans.
- `Planning.module.css`: styles. Under 640px the plans list stacks (each plan a block with labelled dates, via `data-label` and a media query); above that it is a table.
- `bootstrap.tsx` and `main.tsx`: standalone dev entry so the remote can also run alone on its port.

## Data it uses (from `@pi/data`)

Reads: `usePlan(projectId)`, `useProject`, `useMeta` (the data date, `as_of_date`), `useRecommendations`, `useCountryYears`, `useUiStore` (selected project). Writes: `useSavePlan`, `useDeletePlan` (each also appends to `audit_log` and invalidates all queries, so Monitoring's schedule and the shell's tiles refresh). The plan collection is `plans` (planned advertisement, bid opening, evaluation complete and signing dates, category, method).

Real projects have **no** rows in `plans` (public sources hold no four-stage dates). Their plan is `plan_packages` (rows read from a World Bank plan document) and is drawn by the **shell** (`OnRecordCards.tsx`), not by this remote. The Planning stage in the chat shows both when a project has both (`PlanningStage` in `ChatBlocks.tsx`).

## Rules specific to this remote

- Planned dates are `entered` provenance; anything estimated is `derived` with its sample size; a reference with no data is `missing`.
- The duration and restructuring models are **Simulated** and locked until enough projects exist; never present them as real results.
- A control a role cannot use is disabled with the reason, not hidden (`can` and `whyDisabled` from `@pi/config`).

## Tests and checks

Pure logic (stages, estimate timeline) is tested in `packages/data/src/*.test.ts`. The cards are checked in the browser. `pnpm --filter @pi/planning typecheck`.
