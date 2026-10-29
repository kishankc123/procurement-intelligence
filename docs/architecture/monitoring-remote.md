# Micro front-end: `monitoring` (`apps/monitoring`, port 5175)

Federation name `monitoring`. Owns **execution and monitoring**: the Monitoring page and its three building blocks (the disbursement chart, the project schedule, the early-warning board), plus the chat cards made from them. Read `README.md` first.

## Exposed modules

| Module | File | What it is | Used by |
|---|---|---|---|
| `./Monitoring` | `src/Monitoring.tsx` (default export) | The whole Monitoring page ("Execution and monitoring"): alert counters, the disbursement chart, the project schedule, the early-warning board, project key dates, governance context | Shell routes `/monitoring` and `/schedule` |
| `./MonitoringCard` | `src/MonitoringCard.tsx` | The Monitoring (Evaluation) **stage** as a chat card: one sentence on where the project stands, then the three blocks. Props: `{ projectId }` | `ChatBlocks.tsx` stage view |
| `./MonitoringFeature` | `src/MonitoringFeature.tsx` | **One block at a time**: `feature` is `'disbursement-chart'`, `'project-schedule'` or `'early-warning'`; props `{ feature, projectId }` | `MyLifecycle.tsx` (`FeatureView`: features a user added to their own lifecycle, drawn with an example project's data; and the Preview buttons on the option cards) |
| `./ScheduleCard` | `src/ScheduleCard.tsx` | The project schedule (Gantt) alone. Props: `{ project, badge?, footer? }` | Typed in the shell; used inside this remote |

Types are declared by hand in `apps/shell/src/env.d.ts`. After adding an exposed module, restart this remote's dev server.

## The three building blocks

- **`DisbursementCard`** (`Monitoring.tsx`, exported): an SVG scatter of time elapsed (x, % of the period from effectiveness to closing) against disbursed (y), one point per supervision report, an "on pace" line and a dashed alert line at the configured number of points behind (`THRESHOLDS.disbursementLagPoints`, 20). Hover, touch or tab to a point to read the report. On phones the chart keeps a readable 520px width and **only the chart scrolls sideways** (`.chartScroll` in `Monitoring.module.css`), with a "swipe" hint.
- **`ScheduleCard`**: tender rows from the project's plans plus mock operational items (`schedule_items`), each flagged on track, behind or overdue against the data date (`schedule.ts` in `@pi/data`: `scheduleRows`, `scheduleRange`, `projectPhase`). Uses the shared `Gantt` from `@pi/ui`. For a real project without plans it says "No schedule items for this project".
- **`EarlyWarningCard`** (`Monitoring.tsx`, exported): the alert board. Alerts are **derived** by `deriveAlerts` (`@pi/data`, `selectors.ts`) from supervision reports (rating drop, risk increase, disbursement lag), entered contract data (contract past its entered end date) and approved amendments. Urgent first; each alert can be assigned (`useAssignAlert`, role `assign_alerts`) and opens an evidence drawer (`SourceDrawer` from `@pi/domain`).

## Data it uses

Reads: `useReports(projectId)`, `useContracts(projectId, fiscalYear)`, `useEnrichments`, `useAmendments`, `useAlertStates`, `useMeta`, `useProject`, `useGovernance`, `usePlan`, `useScheduleItems`, `useUiStore`. Writes: `useAssignAlert` (also appends to `audit_log`).

Real projects have supervision reports (parsed from the World Bank ISR text; some could not be parsed and are listed in each snapshot's manifest), contracts, but no entered end dates or amendments, so their alert counts are usually 0 and the early-warning board says "No alerts for this selection".

## Rules specific to this remote

- Everything derived shows its sample size (`n=17 reports`) and its provenance chip.
- No supervision reports means an empty state, never an estimate.
- The `Card` wrapper has `overflow-visible` because the chart's tooltip may extend past the card edge.

## Files

`Monitoring.tsx` (page, `DisbursementCard`, `EarlyWarningCard`), `ScheduleCard.tsx`, `MonitoringCard.tsx`, `MonitoringFeature.tsx`, `Monitoring.module.css`, `ScheduleCard.module.css`, `bootstrap.tsx` and `main.tsx` (standalone dev entry), `env.d.ts`.

## Tests and checks

Alert logic and schedule rows are tested in `packages/data/src/selectors.test.ts` and `schedule.test.ts`. Cards are checked in the browser (phone width too). `pnpm --filter @pi/monitoring typecheck`.
