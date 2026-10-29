# Progress

## Block 1 (Day 1, foundation + Planning), done
- pnpm monorepo: `apps/shell` (host, :5173), `apps/planning` (remote, :5174), packages `ui`, `domain`, `data`, `events`, `config`.
- Module Federation works (no fallback needed): shell lazy-loads `planning/Planning`; react, react-dom, react-router, react-query, zustand and the `@pi/*` packages are shared singletons, so the Zustand store and event bus are single instances.
- json-server on :3001 serving `mock/db.json`. `pnpm reset-db` rebuilds it (seed.ts + import-gppd.ts, real GPPD for RO and EE).
- Shell: nav, fiscal-year and project filters, role switcher (localStorage), Mock data banner, tender-coverage meter, provenance legend.
- Planning: plan form (saves to `plans`, role-gated), derived KPIs, gated restructuring and duration cards (n=3 < 30), stage timeline, GPPD country context, recommendations with citations opening the SourceDrawer, Helpful / Not helpful writing to `feedback` and `audit_log`, similar projects.
- Verified in the browser: federation load, data binding, feedback write, SourceDrawer. `pnpm typecheck` is clean.

## Run
```
pnpm install
./run.sh          # reset data, build, serve API :3001, shell :5173, remotes :5174-5176 (demo mode)
./run.sh dev      # hot-reload dev servers instead of the production build
./run.sh keep     # demo mode without resetting mock/db.json
```
Other commands: `pnpm reset-db`, `pnpm typecheck`, `pnpm test` (7 selector tests), `pnpm build:vercel` (assembles `dist-vercel`).

## Block 2: Project data + Monitoring, done
- Project data (shell, `/project-data`): searchable contracts table (public columns locked, entered columns with Entered / Pending / Missing chips), role-gated entry form with validation (bids opened not before advertised), amendment form, Reviewer approve/reject queue, audit trail.
- Monitoring remote (:5175): alerts derived by `deriveAlerts` (rating drop, risk increase, disbursement lag, contract past entered end date, approved amendments), See evidence opens the SourceDrawer (now shows entered records too), Assign writes to `alerts`, disbursement-vs-time chart, key dates, governance table.
- Verified in the browser: Contract manager enters end date for REF-004, Reviewer approves, new alert appears, Assign and evidence drawer work.
- Run also needs `pnpm --filter @pi/monitoring dev` (:5175).

## Block 3: Learning + Tender design + tests + docs, done
- Learning remote (:5176): feedback queue (Accept / Edit with note / Reject, Reviewer only), two derived KPIs with empty states, data coverage by fiscal year, update log from `audit_log`, static roadmap labelled Proposed plan.
- Tender design (shell, `/tender-design`): draft clauses save to `tender_drafts`; comparison reflects the unsaved draft, benchmark gated at 10 contracts, finding derived from the plan.
- Vitest: 5 tests on fiscalYearOf, tenderCoverage, tenderComparison, deriveAlerts (`pnpm test`).
- Docs: DEMO.md (script + live-edit guide), ARCHITECTURE.md updated.
- Verified in the browser: steps 3 and 6 of the script (bid validity finding flips; feedback rejected, KPI and log change).

## Block 4: rehearsal pass, done (committed and pushed)
- `pnpm build` + `vite preview` verified: all five screens load through federation from the production build, no console errors. `pnpm demo` builds and serves everything.
- Knowledge base (registry with simulated Fetch, document search/filter, chunk detail) and Evidence workbench (one seeded conflict with Resolve, provenance trail, grounding table) added as shell pages. New collections: `sources`, `conflicts`; seed adds entered record ENR-S5 to create the conflict.
- Checked all 7 screens at 1440x900: no horizontal overflow, no empty links. Resolve conflict, Fetch and doc detail verified in the browser.

## Block 5: filter wiring, done (committed and pushed)
- Planning now shows which fiscal year the planned signing falls in and flags a plan outside the selected FY. Learning's coverage table follows the selected FY (empty state otherwise).
- Checked in the browser: FY2026 -> FY2025 changes both screens; Planner sees amendment and contract-end entry disabled with a reason.

## Block 6: Planning list and detail, done (committed and pushed)
- Planning now opens on a list of plans (one row per tender being prepared). Open a plan to see its editable stage table (planned dates, actual, reference), KPIs, duration and restructuring gates, country context, recommendations and similar projects. Back to plans returns to the list.
- Data model change: `plans` gained `name`; seed now has three plans (works, goods, consulting) with future dates, replacing the single plan whose dates were in the past.
- Revised: the whole row is clickable (mouse, Enter or Space). The selected plan's stage timeline expands inside the same table, directly under its row, like a dropdown, with Full details and Close (clicking the row again also closes it); Full details opens the full page (KPIs, gates, country context, recommendations, similar projects), Back to plans returns.
- Revised again: the dropdown timeline is read-only (planned, actual, reference) with Edit plan (blue), Full details and Close at the bottom. Edit plan opens the full details page with the plan editable at the top: Save plan (green), Cancel, Delete plan (red, asks to confirm). Full details opens the same page read-only with an Edit plan button. New `useDeletePlan` hook; Button gained `success` and `danger` variants. Deleting is logged to `audit_log`.
- No "New plan" button yet. The tender draft is still one per project (compared with whichever plan you pick).

## Block 7: colour palette, done (committed and pushed)
- Tokens in `packages/ui/src/tokens.css`: `--primary` blue (edit), `--success` green (save), `--danger` red (close, delete), `--on-solid` white text on solid fills. Missing is dark red text with a dotted border (chip and EmptyState title). A dark palette is defined under `:root[data-theme='dark']` with contrast checked, but there is no toggle yet and some screens still use light-only colours.
- Close buttons (plan dropdown, SourceDrawer) and Delete plan are red with white text.

## Block 8: Tender design comparison, done (committed and pushed)
- Tender design now shows the plan being compared with (picker, all four planned dates, category, method, derived bid opening to signing days), the draft clauses with "Saved -> now" hints and Discard changes, and a comparison table: clause, your draft, compared with, reference, difference (draft minus reference), what it means.
- `tenderComparison` returns one row per clause with a list of comparisons: bid validity vs plan (days from bid opening to signing) and vs entered contracts; evaluation method vs plan method (stated rule); contract duration vs entered contracts; minimum similar value vs public contracts of the plan's category. Benchmarks stay gated below 10 contracts; performance security and minimum similar contracts have no source and say Missing.
- Revised: Draft clauses is the main card. The plan sits inside it as a collapsed line ("Compared with plan: name, id"); opening it shows the plan's dates, category, method and bid opening to signing days, plus a small "Compare with another plan" select.
- Fixed overlapping keys in the evidence drawer. Selector tests grew to 7.

## Block 9: Monitoring chart, done (committed and pushed)
- The disbursement vs. time elapsed chart now sits directly under the KPI cards, full width. Y axis has labelled ticks (0 to 100%), gridlines and a "Disbursed (%)" title; the X axis has its own title. Hover (or tab to) a point to see report, date, disbursed %, time elapsed % and the gap, with a crosshair. The dashed line is "On pace"; the red dotted line is the alert line at `THRESHOLDS.disbursementLagPoints` behind pace. Key dates and Governance context are now two separate cards below the board. The tooltip follows the pointer and sits below it (it never covers the pointer, stays inside the card at the edges); with keyboard focus it anchors under the focused point.

## Block 10: deployment, tooling and repo hygiene, done (committed and pushed)
- Vercel: `vercel.json` builds with `pnpm build:vercel` (all apps with `DEPLOY=vercel`, then `scripts/assemble-vercel.mjs` puts the shell at the root and remotes under `/remotes/<name>/`, one origin). The mock API runs as `api/[...path].js` (json-server over an in-memory copy of `mock/db.json`). Remote entries and the API base switch by environment (`API_BASE` in `@pi/config` uses `/api` on any host except localhost). Verified locally (remotes load from `/remotes/...`, API GET and POST work); not yet deployed. Limit: writes live in function memory and reset on a cold start or redeploy, so rehearse and present from `./run.sh`.
- `run.sh`: one command to free the ports, reset data, build and start everything.
- Git: history rewritten earlier to remove the Claude co-author trailer (remote has none); a stale `rebase-merge` state left over from that was cleared with `git rebase --quit`. `main` matches `origin/main`.

## Block 11: Learning contract data readiness chart, done (nothing committed)
- Learning has a "Contract data readiness" card above the coverage table: horizontal stacked bars (usable, pending review, not usable, missing) per entered field that Tender design or Monitoring reads (bid validity, contract end date), on one zero-based count axis with the common denominator (contracts in the selected project and fiscal year, the same population as the coverage table). Counts are always visible as text; a screen-reader table and per-bar labels are included. Non-interactive (no reliable field/status filter exists in Project data).
- `dataReadiness` in `packages/data/src/selectors.ts` does the counting; `bidValidityDays` and `contractDurationMonths` are the shared validity rules, now also used by `tenderComparison`, so benchmark and chart cannot disagree. `StackedBars` in `@pi/ui` is presentational only. No new dependencies, no data-model or seed changes. 12 tests pass.

## Block 12: shadcn/ui for Button, Badge and Card, on branch `shadcn-ui` (nothing committed)
- Tailwind v4 stays without preflight (screens keep their look); `packages/ui/src/styles/globals.css` maps shadcn colour names onto the tokens in `tokens.css` (one palette) and defines the dark variant on `data-theme="dark"`.
- `@pi/ui` `Button`, `Badge` and `Card` are now thin wrappers over the shadcn components in `packages/ui/src/components/ui/` (customised: our radius, `success` and `danger` button variants, severity badge tones, card title is an `h2`). Their props are unchanged, so no screen changed. The old CSS Modules for those three are deleted.
- Tailwind CSS is emitted once, by the shell (it scans `apps/`, `packages/domain` and `packages/ui`). The remotes also have the plugin and import the stylesheet in their standalone `bootstrap.tsx` only, so the federated path does not load it twice. `radix-ui` is only used inside `@pi/ui`, so it is not a separate shared singleton.
- Gates run: typecheck, 12 tests, `pnpm build`, `pnpm build:vercel`, all screens load through federation, no overflow at 1440x900. Cards are `div` now, not `section`.

## Block 13: shadcn Dialog and Select, on branch `shadcn-ui` (nothing committed)
- `@pi/ui` has a new `Select` (options list, `value` and `onValueChange`; values must not be empty strings) on the shadcn/Radix Select. All 12 native `<select>` elements (top-bar filters, Project data, Planning, Tender design, Knowledge, Monitoring assign) now use it.
- `SourceDrawer` is a shadcn Dialog styled as a right-hand panel (kept the red Close button). It is now modal: focus is trapped, Escape or a click outside closes it, the page behind is blurred and not clickable.
- Checked: typecheck, 12 tests, `pnpm build:vercel`, Select opens and picks (fiscal year, field), dialog opens and closes, no overflow at 1440x900 on all 7 screens. Radix renders a hidden native select per Select for forms, so `document.querySelectorAll('select')` is not empty.

## Block 14: Work with AI, milestone 1 (nothing committed)
Why: the assessment asks for ingestion of public data, linking structured records with unstructured text, and AI output with feedback. New page `/work-with-ai` (top-bar button), one project at a time, three layers, each ending in Helpful / Not helpful (feeds the Learning queue as `AI-LAYER-<layer>-<project>`).
- Layer 1 Connect a source link: type check (`checkSourceUrl`: https/http only, no credentials, public host), reachability (`checkReachable`: browser `no-cors` fetch, so it only knows an answer arrived, not the status or content; the UI says so), publisher recognised from `KNOWN_SOURCE_HOSTS` in `@pi/config` or shown as Missing. Saved to `source_links` (roles with `add_source_link`).
- Layer 2 Run ingestion (Simulated): `ingestionSteps` reports validate, reach, classify and link from stored checks; Extract is shown as Planned, nothing is read. Saved to `ingestion_runs` (`run_ingestion`), logged in `audit_log`.
- Layer 3 Link records: `linkRecords` joins contracts and supervision reports with document chunks of the same project by contract reference, same report/document date, or project mention; each row shows the rule and cites both sides.
- Data additions: collections `source_links`, `ingestion_runs`; permissions `add_source_link`, `run_ingestion`. 8 new tests (20 total).
- Done since: M5 Schedule (Block 15), M2 retender check (Block 16), M3 specification checks (Block 17) and M4 supplier profiles (Block 18).
- Still to build: nothing from the original list. See Not done for open items.
- (old note) M5 Gantt schedule with seeded running projects in different phases (stock, manpower and similar task rows are mock and labelled).

## Block 15: Schedule (Gantt), milestone 5 (nothing committed)
- New page `/schedule` (top-bar link, listed in the Platform tools table). A project table shows each project's phase (`projectPhase`: not yet effective is Preparation, closing within 12 months is Closing, no works, supplies or manpower item started is Procurement, otherwise Implementation) and how many items are behind or overdue. Click a project to see its Gantt chart (`Gantt` in `@pi/ui`, presentational): month axis, bars with recorded progress, milestones as diamonds, a line at the data date (`meta.as_of_date`), statuses written out in the label column, a detail strip on hover, focus or click, and a screen-reader table.
- Rows: one tender row per plan (advertisement to signing, from the Planning plans) plus `schedule_items` (mock operational records: works, supplies, manpower, milestones; progress values are mock inputs, labelled). Status is derived by `scheduleRows`: expected progress is the share of the item's time used; behind when it trails recorded progress by more than `THRESHOLDS.scheduleLagPoints` (20); overdue past the end date below 100%; "No progress recorded" when none is stored.
- Seed: three projects in three phases (P-MOCK-001 Implementation with REF-001 behind, matching ISR 2; P-MOCK-002 Procurement; P-MOCK-003 Preparation). Data addition: collection `schedule_items`. 7 new tests (27 total). Feedback on the schedule view goes to the Learning queue as `AI-LAYER-schedule-<project>`.

## Block 16: Retender check, milestone 2 (nothing committed)
- Layer 4 on Work with AI, "Check for a retender". `checkRetender` (`packages/data/src/retender.ts`) compares a tender id, contract reference or name with the tenders on record: same id (also the contract reference an awarded tender became), same name (ignoring case, punctuation and filler words), similar name (at least `THRESHOLDS.retenderNameSimilarity` = 60% shared words) and numbered variant (same name, different number such as another lot). Verdicts: Check before issuing (an earlier tender looks the same: shows status, reason and citation), Note (numbered variant only) or No match, always with how many tenders were compared.
- Records searched: new mock collection `tender_history` (awarded, cancelled and re-tendered tenders across projects, each cancelled one with its reason and a citation to the supervision or completion report text) plus the plans not yet advertised. Typing checks one tender; the table below checks each plan of the selected project automatically (the plan itself is excluded). Seed examples: plan "Road safety signage supply" matches a cancelled earlier tender whose bid validity expired (ISR 3); "Pipe supply tender" matches a cancelled tender and its re-issue; "Road resurfacing works, Lot 3" is a numbered variant of Lot 2, which had to be re-bid.
- 7 new tests (34 total). Feedback on this layer goes to Learning as `AI-LAYER-retender-<project>`.

## Block 17: Specification checks, milestone 3 (nothing committed)
- `specificationChecks` (`packages/data/src/spec.ts`) checks a tender draft against its plan, the project, contract data and the guidance note, with eight rules: required clauses set; bid validity covers bid opening to signing (fail below, warn with no margin); performance security within the guidance range for works (`SPEC_RULES` in `@pi/config`, cited to the guidance chunk); evaluation method fits the plan method; planned evaluation days against GPPD C5.2; contract end (signing plus duration) before the project closing date; minimum similar contract value against signed contracts of the same category (gated at `tenderBenchmarkMinContracts`); and an earlier cancelled or re-tendered tender with the same name (uses the retender check, cites its reason). Each result is Pass, Check, Fail or Cannot check (no source, so nothing is estimated), with the rule, the draft value, what it was compared with and citations.
- UI: a "Specification checks" card on Tender design that checks the unsaved draft against the chosen plan, and layer 5 on Work with AI that summarises every plan of the project against the saved draft. Feedback goes to Learning as `AI-LAYER-spec-<project>`.
- 8 new tests (42 total). No data-model change; `EXPECTED_EVALUATION` and `DEFAULT_EVALUATION` are now exported from selectors.
- Note: there is still one tender draft per project, so layer 5 checks the same draft against each plan (plan 3 fails on bid validity because its bid-opening-to-signing period is 90 days).

## Block 18: Supplier profiles, milestone 4 (nothing committed)
- New page `/suppliers` (top-bar link, listed in Platform tools): a table of suppliers across projects and a profile card per supplier with its contract history. `supplierProfiles` (`packages/data/src/supplier.ts`) groups contracts by supplier id and derives: contracts and projects, committed USD, price change (approved amendment value changes ÷ contract amounts, contracts still running included), time extensions, and delay of completed milestones (actual minus planned). Only approved amendments count.
- Shortfall flags are three rules over that history, shown with their evidence chips: price change above `supplierPriceGrowthPct` (10%), average milestone delay above `supplierDelayDays` (30), and at least `supplierTimeExtensionShare` (50%) of contracts extended. Flags need `supplierProfileMinContracts` (3) contracts; below that the history is shown in grey without a verdict. All four settings are in `THRESHOLDS`.
- Data additions (mock): `contracts` now include 8 more rows for the same suppliers on P-MOCK-101, 102, 103 and 002 (REF-101 to REF-107, REF-202); `amendments` has 4 approved ones; `contract_milestones` has 11 with planned and actual dates (REF-001 mobilisation is 66 days late, matching ISR 2). New schema `ContractMilestone`, hooks `useAllContracts` and `useContractMilestones`; SourceDrawer now finds contracts of any project and milestones. Screens that take a project still filter, so P-MOCK-001 still has 6 contracts.
- 6 new tests (48 total). Feedback goes to Learning as `AI-LAYER-supplier-<supplier id>`.

## Block 19: AI remote and project-aware button (nothing committed)
- Work with AI moved out of the shell into its own federated remote `apps/ai` (:5177, exposes `./WorkWithAI`, base `/remotes/ai/` on Vercel). The shell lazy-loads it behind `RemoteBoundary`. Verified: with only :5177 stopped, `/work-with-ai` shows an error card and Planning, Monitoring, Learning, Schedule and Suppliers still work. `run.sh`, `scripts/assemble-vercel.mjs`, the shell remote list and docs know about the fourth remote; root `dev` and `preview` use `pnpm -r --no-bail` so one failing remote no longer stops the rest (before this, stopping one preview server took all of them down).
- (Superseded by Block 21: the button no longer shows a project name.)
- Schedule and Suppliers remain shell pages.

## Block 20: schedule inside Monitoring, wrapped AI button (nothing committed)
- The schedule moved into the Monitoring remote as a "Project schedule" card (`ScheduleCard`), after the disbursement chart, for whichever project is selected: phase, behind or overdue count, Gantt, detail strip and feedback. The shell Schedule page, its top-bar link and its Home table row are gone; `/schedule` redirects to `/monitoring`. The earlier cross-project table of phases went with the page.
- The Work with AI button is two lines ("Work with AI", then "on <project>" in smaller text), wraps long names, keeps a 150px minimum width, and the top bar wraps so on a phone it drops to its own row.

## Block 21: project list before the AI features (nothing committed)
- The Work with AI button is plain again (no project name). `/work-with-ai` always opens on a Projects list inside the AI remote; Select sets the shared project and then shows the five layers for it, with Change project to return. The `projectChosen` store flag and the two-line button styles were removed as unused.

## Block 22: Project overview page (nothing committed)
- Clicking a project name opens `/project` ("Project overview") for it: from the Home projects table (name button, tooltip "Open project overview") and from the top-bar Projects menu. There is no separate overview link or menu item. The page shows a Project card (dates, phase) and four sections labelled "From <section>" with "View more in <section>" links: Plans (Planning), Draft clauses (Tender design), Project schedule (Monitoring), Contract data readiness (Learning, same stacked bars).
- The schedule section is the same `ScheduleCard` Monitoring shows, including the Gantt chart: the Monitoring remote now exposes `./ScheduleCard` (optional `badge` and `footer` props) and the shell lazy-loads it behind a `RemoteBoundary`. If Monitoring is down, only that section shows an error card; the rest of the overview still loads (the other sections read shared data through `@pi/data`).

## Block 23: filter rail restored (nothing committed)
- The left `FilterRail` is back as its own component (`apps/shell/src/FilterRail.tsx`): a thin strip with an arrow and "Project · Year · Role" that opens to Project, Fiscal year and the demo Role switcher (Planner, Contract manager, Reviewer, Admin; stored in localStorage). It sits beside the top-bar menus; on phones it is a drawer with a scrim. Checked: FY2025 empties the Learning readiness card and the StepNav shows FY2025; Reviewer disables Planning's Edit plan with "Needs role: Planner or Admin". Empty-state text now says "filters on the left" instead of "top bar".

## Block 24: icons in the top-bar menus (nothing committed)
- Projects (folder) and Tools (wrench) triggers have an icon and a chevron; each Tools item has its own icon (Project data, Knowledge base, Suppliers, Evidence workbench) and no link underline. Icons come from lucide-react, re-exported from `@pi/ui` (`packages/ui/src/icons.ts`) so apps do not depend on it directly.

## Block 25: back navigation (nothing committed)
- New reusable `BackButton` (`apps/shell/src/BackButton.tsx`), a plain arrowhead icon (no label, no border) rendered by the shell `App` right above the breadcrumbs on every page except the dashboard. It goes back one page inside the site (`navigate(-1)`); if the page was opened directly, with nothing behind it in this tab, it goes to the dashboard (`/`) instead. "Back to plans" in Planning now has an arrow icon too. Checked: Home to a project overview and back; the chain Monitoring (direct load), Planning, Tender design then three Back clicks ends on Monitoring, then the dashboard.
- Not covered by browser back by design: in-page steps held in component state (the Work with AI project list and Planning's plan details); those keep their own Change project and Back to plans buttons.

## Block 26: Plan timeline calendar and agenda (nothing committed)
- Planning now opens with a "Plan timeline" card (`apps/planning/src/PlanAgenda.tsx`): a shadcn Calendar (new dependencies in `@pi/ui`: `react-day-picker`, `date-fns`; component `packages/ui/src/components/ui/calendar.tsx`, exported as `Calendar`) with the four tender stages marked in colour, the days between advertisement and signing shaded, and the data date outlined; next to it a proportional bar and an agenda list (stage, weekday and date, how far from the data date, and the days between stages, plus the advertisement-to-signing total). Click a stage in the list and the calendar jumps to its month and rings it; click a stage day on the calendar and the list highlights it. A select switches between the project's plans. Two months on wide screens, one on narrow. The days from advertisement to signing sit on one soft tinted band (square corners so neighbouring days join up) instead of separate blocks. Dates come from the saved plan; if they are out of order the card says so instead of drawing the bar.
- `planStages` (`packages/data/src/stages.ts`) does the arithmetic, with 3 tests (51 total).
- `ghost` and `link` Button variants now set a transparent background (without Tailwind's base reset a bare button showed the browser's grey).

## Block 27: Planning has its own addresses, and Edit plan is a modal (nothing committed)
- The shell mounts Planning at `/planning/*`; the remote now has its own routes: `/planning` (timeline card and plans table) and `/planning/full-details/<plan id>` (one plan: stage timeline, KPIs, gates, country context, recommendations, similar projects). Full details opens that address, so refresh, bookmark and the browser back button work; an unknown plan id shows "Plan not found" with a way back. The StepNav keeps Planning lit on sub-pages. The standalone remote wraps `Planning` in a router at `/planning/*`.
- Edit plan is a modal (`EditPlanDialog`): category, method and the four dates, with Save plan, Cancel and Delete plan (asks to confirm). It opens from the row dropdown without leaving `/planning`, and from the full details page; deleting there returns to `/planning`. The old inline editor on the details page is gone; its stage table is read-only.

## Block 28: Tender design charts (nothing committed)
- New "At a glance" card between Draft clauses and the comparison table, drawn from the same numbers and following the unsaved draft: (1) a bid validity diagram (`ValidityCoverage`): the draft's validity counted from bid opening as a bar, the planned signing as a line, a hatched band when bids expire early and a tinted band for days to spare; (2) a draft-versus-reference bullet chart (`BulletChart` in `@pi/ui`, one row per clause: draft bar, reference marker, the numbers written under each bar). Rows come from `glanceRows` (`packages/data/src/glance.ts`): comparisons and specification checks now carry a `numeric` pair; a benchmark row appears only once its sample gate is met, and a line says how many comparisons are not drawn and links to Project data. 3 new tests (54 total).

## Block 29: grouped specification checks with a bar chart (nothing committed)
- The Specification checks card now has a bar chart of results (`ColumnChart` in `@pi/ui`: y is the number of checks on whole-number ticks, x is the result: Pass, Fail, To check, Cannot check; each bar is a button) above a table with one row per result (`SpecGroups`, `apps/shell/src/pages/SpecGroups.tsx`). Click a bar or a row to open that group, like a plan row: its checks appear below with the rule, the draft value, what it was compared with, what was found and the evidence chips. One group is open at a time; empty groups show a zero and cannot open. Until someone picks, the most serious non-empty group (Fail, then To check) is open. The label for warnings is now "To check" (was "Check") everywhere.

## Block 30: legends on the Tender design charts (nothing committed)
- The "At a glance" charts now explain themselves. The bid validity diagram has a key (draft validity bar, planned signing line, uncovered days, days left after signing), day numbers and dates on its axis, and "Valid N days, until <date>" inside the bar. The marker chart was replaced by `PairedBars` in `@pi/ui` (`BulletChart` removed): for each clause two labelled bars on one zero-based scale, the draft on top (colour = how it fared) and its reference below (hatched grey), each with its value at the end, the difference written out, a key for the colours and a line saying each row has its own scale.

## Block 31: Tender design comparison table replaced by the charts (nothing committed)
- The "Draft vs. plan and benchmarks" table is gone; the card of that name now holds the charts. Each pair of bars has an info icon next to its difference: "i" for fine, "!" for something to look at, "?" for unknown. It opens on hover, focus or click (Escape closes) with what the result means, how the reference was worked out and the evidence chip, which still opens the source drawer (`InfoTip` in `@pi/ui`; content from `WhatItMeans`). Clauses that cannot be drawn yet stay as blank dashed rows with the reason and, when contract data would fix it, an "Add tender data" link (`glanceGaps`; `PairedBars` takes a `gaps` prop). The bid validity diagram has less text: a short key and a one-line result. Evaluation method (a text comparison) is only in the Specification checks. 56 tests.

## Block 32: pagination and scrolling for tables (nothing committed)
- New in `@pi/ui`: `paginate` and `pageWindow` (pure, tested), `usePagination`, `Pagination` (range text, Previous and Next, page numbers with ellipses, rows per page 10, 25 or 50; hidden when everything fits on 10 rows; the range is announced to screen readers) and `Paged`, a wrapper that owns the page state around a `<table>` so it can sit anywhere in a screen (`resetKey` returns it to page 1 when a search or filter changes; the page is also clamped when the list shrinks). `TableScroll` takes `maxHeight` for vertical scrolling with the header row kept in view, on top of the sideways scroll it already had.
- Applied to: Project data (contracts, review queue as one list, audit trail), Knowledge (documents), Learning (feedback queue, update log, which now shows all entries instead of the last 10), Suppliers, Home projects, Work with AI (source links, record links) and the Planning plans table. Contracts, audit trail, feedback queue, update log and record links also scroll vertically at 520px. Small fixed tables (country context, stage timelines, spec checks, supplier contract history) are left alone. 9 new tests (63 total).

## Block 33: carousels, skeletons and breadcrumbs (nothing committed)
- Carousel (`Carousel` in `@pi/ui`, CSS scroll snapping, no new dependency): the KPI card rows on Monitoring, Learning and a plan's full details are carousels. Swipe or scroll, use the arrows or dots, or press the left and right keys on the row; plain tall chevrons (no background) sit in the page margin beside the row, so the cards span the same width as the cards below, and stay visible (disabled when every card fits), and the dots appear when cards overflow. Slide-to-index and scroll-edge logic is pure and tested.
- Skeletons (`Skeleton`, `SkeletonText`, `SkeletonTable`, `SkeletonCards`, `PageSkeleton` in `@pi/ui`): every `Card state="loading"` now shows shimmering placeholder lines (no animation under reduced motion), and a screen whose code is still loading (the `RemoteBoundary` fallback) shows a page-shaped skeleton. All announce "Loading" to screen readers.
- Breadcrumbs (`breadcrumbTrail` in `@pi/config`, tested; `Breadcrumbs` in the shell): "Home / Monitoring", "Home / Planning / <plan name>", "Home / Tools / Suppliers", "Home / Project overview", "Home / Work with AI". The last crumb is the current page; "Tools" is a group with no page of its own. Not shown on the dashboard. 72 tests.
- Delete (`ConfirmDeleteDialog` and `DeleteButton` in `@pi/ui`): every plan row has a trash icon with "Delete", and the Tender design draft card has one too. Both open "Are you sure you want to delete this ...?" with Yes (red) and No (green); Edit plan's own delete uses the same dialog. Deleting writes to `audit_log`. Needs the `edit_plan` / `edit_tender_draft` permission, otherwise disabled with the reason. New hook `useDeleteTenderDraft`. After the only draft is deleted Tender design shows its "No tender draft" empty state; there is no New draft button yet (`pnpm reset-db` restores it).
- Carousel arrows are plain chevrons in the page margin and the back button is an arrowhead above the breadcrumbs.

## Block 34: seeded volumes (nothing committed)
- New `mock/seed-extra.ts`, merged by `seed.ts`: more of every collection so paging, sticky-header scroll and carousels show. All rows are Mock and validate against the Zod schemas. Counts: 49 contracts (28 FY2026 on P-MOCK-001), 60 enrichments, 17 amendments, 27 milestones, 22 plans, 3 tender drafts, 6 supervision and 6 completion reports, 22 documents, 30 chunks, 16 feedback items, about 165 audit entries, 12 source links with 8 simulated runs, 28 schedule items, 15 tender-history records.
- Gates by design: bid validity (12 contracts) and tender duration inputs unlock their benchmarks; contract end date has 9 of 10 (one more approved entry unlocks it live); bidders has 7 of 10 and stays gated. Two end dates are already past, so two alerts exist before the demo starts.
- Honesty unchanged: every added value carries a Mock source note; nothing is estimated.

## Block 35: scrolling and decision controls (nothing committed)
- Carousel: arrows and dots show only when the cards overflow; otherwise it is a plain row (reverses the earlier "always visible" arrows).
- Gantt (`@pi/ui`): works like a frozen spreadsheet. The label column and the month row stay in view while the chart scrolls up, down and sideways; its width follows the number of months. `visibleRows` (Monitoring passes 8) limits the height, with a Show all / Show fewer button.
- Monitoring early-warning board: shows high-severity alerts first with "Show all N"; the full list scrolls in a bounded box. With no high alert it shows everything.
- Learning feedback queue: Accept (green, check) and Reject (red, cross) share the Decision column; Edit (blue, pencil) has its own column and opens a modal with a note field. Saving marks the item edited.

## Block 36: top bar and filter rail no longer scroll away (step 1)
- Cause: Radix menus, selects and dialogs lock page scroll by setting `overflow: hidden` on the body. The body then became a scroll container, so the sticky top bar and filter rail stopped sticking and scrolled out of view while a menu or the rail's selects were open (measured: both at -400px after scrolling 400px). Fix: `html body[data-scroll-locked]` keeps `overflow-x: clip` / `overflow-y: visible` in `packages/ui/src/tokens.css`.
- The Projects and Tools menus are now non-modal (`modal={false}`), so a click on the page while one is open closes it and still reaches what was clicked.
- Not changed: on narrow screens (720px and below) the open filter rail is a drawer, and a click on the page still closes it by design.

## Block 37: documents open full screen (step 2)
- New `DocumentDialog` in `@pi/domain`: a document opens full screen with a title bar (document icon, title, type and ID, Close), a page-style card with type, date, pages, project, parse status and source chip, then its text grouped by section with page numbers (paged, 4 sections per page). A document with no chunks (pending or failed parse) shows "No text to show" with the parse status; nothing is estimated.
- Knowledge base: the split "Document detail" card is gone. Documents is one full-width, paged, scrolling table whose rows are a document icon tile plus title and ID (not a button), with a type column, date, pages and a coloured parse badge. Clicking a row opens the dialog. Search and type filter share one row.
- Evidence drawer: the document name is a link that opens the same full-screen document (`DocumentDialog` is used from `SourceDrawer`).

## Block 38: supplier icons (step 3)
- New `SupplierName` in `@pi/ui`: a very small round organization icon (12px in an 18px circle) before a supplier name. All suppliers get the same icon because the public record has no person type; no data change. Used in the Suppliers list and the Project data contracts table.

## Block 39: record linking as a tree (step 4)
- `groupLinksByRecord` in `@pi/data` (tested, 73 tests) groups the links by structured record. Work with AI layer 3 now shows each record once on the left (for example "Supervision report 1", with a count) and an arrow from it to every document text linked to it, with the reason on each row. The tree is CSS only (a trunk and arrowheads in a narrow column). The table pages and scrolls by record, and each document row has an Open document link that opens the full-screen document.

## Block 40: retender matches one at a time (step 5)
- Work with AI layer 4: the "earlier tenders that look like it" cell shows one match in a fixed-height box. With more than one, scroll inside the box (it snaps to the next match) and a line reads "Match 1 of N". The page and table do not move. A single match fits the box with no scrollbar. The same component serves the typed check and each plan row.

## Block 41: scroll and paging sweep (step 6)
- Now paged with a bounded, scrolling table: Project overview plans, Suppliers contract history, Planning similar completed projects, Knowledge source registry, Work with AI projects, "Your plans" retender table and the specification-check table (14 plans each, pages of 10). Source links and pending entries got a maximum height. Pagers appear only above 10 rows, as before.
- Left as they are because they cannot grow: key dates, governance, country context, plan stage table, coverage by fiscal year, platform tools, spec-check groups, grounding table, plan reference.

## Block 42: chat landing page and assistant server (nothing committed)
- Scope change, by K's request: the landing page is now a chat, and a small Node server answers it. This reverses the `CLAUDE.md` items "no backend beyond json-server" and, in spirit, "no agent orchestration"; it still calls no model and no live source.
- Server: `server/index.ts` (plain Node, no new package), `pnpm assistant`, port 3002, started by `./run.sh`. `POST /chat` takes `{ message, history }` and answers from `mock/db.json`, read on every request. `GET /health` for checks. CORS is open because the app runs on another local port.
- Logic: `packages/data/src/assistant.ts` (pure, 9 new tests). `resolveProject` finds the project by id, then by words shared with its name, country and sector, asks which when two fit, and for "one of the mock projects" takes the one with the most contracts and says so. `answer` returns `{ reply, steps, options, dossier }`: the steps imitate the services a full system would call (projects, contract awards, procurement plans, supervision reports, contract management, document store, evaluations), the dossier is the counts found. Every reply is marked `simulated: true`.
- UI: `ChatWindow` in `@pi/domain` (presentational, driven by messages, so another assistant or CopilotKit can drive it later); `AgentRun` in the shell plays the steps one by one, then the text, then the "Your procurement solution is ready" card with the four stages (counts from the dossier, zero shown as Missing) and buttons into the existing Planning, Tender design, Monitoring and Learning pages. The finished reply sets the selected project for every screen. The conversation lives in the shared store, so it is still there when you come back. The old donut stays below as "What the assistant sets up".
- Not done: the Vercel deployment has no `/api/chat` yet, so the landing chat shows "The assistant server did not answer" there. No model, no CopilotKit, no real World Bank sources yet.
- Note: `pnpm server` is a built-in pnpm command, so the script is `pnpm assistant`. After adding exports to `@pi/config` the dev servers need a restart (the shared-module list is cached); I restarted only the shell.

## Block 43: chat blocks and intents (chat step 1, nothing committed)
- Protocol: the reply now carries `blocks` (`ready`, `lifecycle`, `stage`; ids only, no figures), `projectId` (the project the reply is about) and options with a `prompt` (what a click sends, repeating the request). The request carries the conversation's `projectId`, so "show the plan timeline" needs no project name.
- `detectIntent` (rule-based, tested): the whole lifecycle first ("entire timeline", "all the stages"), then planning, tender design, monitoring, learning. `answer(db, message, contextProjectId)` order: a project named in the message wins, then "one of the mock projects", then the project in the conversation. A stage with no known project asks which one.
- Chat UI (`apps/shell/src/chat/`): `BlockView` draws blocks. Ready and lifecycle show the big donut with what each stage has (read live from the same hooks as the pages, zero shown as Missing). A stage view starts with the small donut (current stage lit) so the user can switch stages; clicking any donut slice or tile sends "Show <stage>" as a chat message. The stage bodies are placeholders marked Planned until steps 2 to 5 build the cards.
- 91 tests pass (10 new). After changing shared exports the shell dev server must be restarted.

## Block 44: the Planning card in the chat (chat step 2, nothing committed)
- The Planning remote now also exposes `./PlanningCard` (`apps/planning/src/PlanningCard.tsx`). In the chat's Planning stage it shows one summary line (how many plans, first advertisement to last signing, Entered), the plan timeline (`PlanAgenda` with a new `compact` mode: calendar above, agenda below, one month) and the plans table (`PlanList` made reusable: optional Full details, `compact` drops the category and method columns). Edit and delete work as on the page, with the same role gating and the delete confirmation. It loads through `RemoteBoundary`, so a failing Planning remote only breaks this card.
- The assistant's sentence for the stage is suggestive and data-bound: "I found N procurement plans for X ..." (or says plainly that there are none).
- 92 tests pass. The planning remote and the shell dev servers needed a restart to pick up the new exposed module; the other remotes were left running.
- Known: the chat window is short for tall cards (it scrolls inside); a taller chat layout is part of the last step.

## Block 45: new landing page and bigger chat (nothing committed)
- Top bar: Projects, Tools and Work with AI are removed; only the brand is left. The old pages still exist by address but nothing links to them. The filter rail (and its role switcher) stays for now.
- Landing: only "What the assistant sets up", one line of text and the large donut (hovering a step shows what it does; no default project, no project wheel, no project facts), then the chat below. Clicking a donut slice asks the assistant for that stage, which asks which project when none is chosen yet. The old Projects table and Platform tools card are gone from the landing page.
- The chat starts as a small window (`size="compact"`: a greeting, suggestions and the input, at most 360px tall) under the donut. Once anyone clicks or focuses inside it, or a message exists, the donut section disappears and the chat grows to full size and takes the page (it stays hidden when you come back with a conversation). The chat window is larger: up to 1040px wide and 520 to 880px tall, based on the screen height.

## Block 46: where the chat looks after a message (nothing committed)
- The chat log is anchored at your last message: after you send, your message is at the top of the log and the assistant's run, text and cards read from their first line below it (before, the log jumped to the end of a tall answer). A new message also scrolls the chat window to the top of the page. It re-anchors only when a message is added, so scrolling inside the log is not undone.
- Bug fixed: pressing a suggestion button used to hide the donut section on pointer-down, so the button moved away before the click finished and nothing was sent. The donut now goes away when the input is focused (`onEngage` on `ChatWindow`) or a message exists, never because a suggestion button was pressed.

## Block 47: the tender draft card in the chat (chat step 3, nothing committed)
- `suggestTenderDraft` in `@pi/data` (9 new tests): one suggestion per clause with how it was worked out, or no value and the reason. Bid validity = the plan's bid-opening-to-signing days plus a margin (`DRAFT_SUGGESTION.bidValidityMarginDays`, 30, in `@pi/config`); evaluation method from the plan's method (the existing rule); performance security = midpoint of the guidance range (works only); contract duration and minimum similar value = medians, only above the sample threshold (10); minimum similar contracts = never suggested (no source). Missing clauses stay blank, and Save stays off until every figure is filled.
- `TenderDraftCard` (`apps/shell/src/chat/`): editable figures, a hint under each with the suggestion, a Derived chip with n, a "Use it" link; a plan picker; Save draft (updates) or "Save as the draft" (creates, new hook `useCreateTenderDraft`); role-gated like the page; below it the validity-vs-signing diagram and the specification-check counts for the unsaved figures. A saved draft feeds the old Tender design page, Work with AI and the audit log. If a draft already exists it shows the saved figures with the suggestions beside them.
- The server's sentence for the stage says whether a draft exists or one was prepared.
- 98 tests pass. Shell and assistant servers restarted (new shared exports).

## Block 48: the Monitoring cards in the chat (chat step 4, nothing committed)
- `Monitoring.tsx` is split: `useMonitoringData(projectId)`, `DisbursementCard` and `EarlyWarningCard` (the urgent-first board with Show all, evidence drawer and assign) are now reusable and the Monitoring page uses them too (checked: the old page still shows every section). The remote also exposes `./MonitoringCard`.
- `MonitoringCard` in the chat's Monitoring stage: one summary sentence (how many warning signals, how many urgent, the latest disbursement gap against the alert line, Derived with n reports), then the disbursement chart, the project schedule (frozen labels, 8 rows, Show all) and the early-warning board, all fitting the chat bubble. The server's sentence says how many supervision reports exist, or that there are none.
- 99 tests pass. The monitoring remote, the shell and the assistant were restarted.

## Block 49: the Learning card and feedback on the chat's cards (chat step 5, nothing committed)
- `Learning.tsx` is split: `FeedbackQueueCard` (queue, Accept, Reject, Edit modal), `feedbackFigures`, and `useFeedbackTitles` are reusable and the Learning page uses them (checked: the old page still shows figures, queue, readiness, update log, roadmap). The remote exposes `./LearningCard`.
- Chat Learning stage: a sentence from the server (how many pieces of feedback, how many reviewed and accepted, or that nobody has rated anything), the two figures, and the queue. A rating given in the chat shows up in the card straight away.
- Feedback on the chat's own cards: under every block (ready, lifecycle, each stage) there is "Was this useful?" with Helpful and Not helpful. It writes to the `feedback` collection with target `AI-LAYER-chat<card>-<project>` (for example `chatplanning`, `chattender`, `chatmonitoring`, `chatlearning`, `chatready`, `chatlifecycle`), which Learning labels "Chat · Planning card" and so on. Checked end to end: a Not helpful on the Learning card appeared in the queue as "Chat · Learning card".
- 100 tests pass. The learning remote, shell and assistant were restarted; data reset after testing.

## Block 50: the assistant on Vercel (nothing committed)
- Problem: the deployed site had no `/api/chat` (only json-server answers under `/api`), so the chat showed "The assistant server did not answer".
- Fix: `api/chat.ts` is a Vercel function with the same logic as `server/index.ts` (POST only, JSON body, 400 for a bad message, 405 for other methods). It is registered in `vercel.json` with `mock/db.json` bundled. `packages/data/src/assistant.ts` no longer imports `@pi/config` (stage labels are local, and a test keeps them equal to the donut's), so the function loads without the workspace packages: bundled alone as CommonJS it is 774 KB and contains no `@pi/` reference. The deployed client already calls `/api/chat` (`ASSISTANT_BASE`).
- Limit: the function answers from the seed file. Edits made on the deployed site live in the json-server function's memory, so server sentences that count live data (a saved draft, feedback totals) reflect the seed, not those edits. The cards themselves read live data and are unaffected.
- Checked here: handler called directly (POST, string body, GET 405, bad message 400), the bundle check, `pnpm build:vercel`, 100 tests. Not checked here: the real Vercel deploy.
- First deploy answered 500. The function now loads the shared logic inside a try block and answers `{ error, detail }` on any failure (also logged with `console.error`), and the chat shows that text: "The assistant server answered with an error (500). The assistant function failed. <detail>". The committed `mock/db.json` was checked and has every collection the assistant reads, so the cause is in how Vercel loads the function, not the data.

## Block 51: the chat function as plain JavaScript (nothing committed)
- The deployed `api/chat.ts` answered `FUNCTION_INVOCATION_FAILED` (the function crashed before it could answer), while the plain JavaScript json-server function next to it works. So the function is now plain CommonJS too: `api/chat.js` requires `api/_lib/assistant.js`, a generated CommonJS copy of `packages/data/src/assistant.ts` (`pnpm build:chat`, `scripts/build-chat-function.mjs`, using the esbuild that comes with tsx; TypeScript 7 has no transpile API). It needs only `zod`. Files under `api/_lib` are not functions (underscore prefix). `vercel.json` registers `api/chat.js`.
- A test (`scripts/chatFunction.test.ts`, 2 tests, 102 in all) fails when the generated copy is stale and checks it gives the same answers as the TypeScript source for the seed data. After editing `assistant.ts`, run `pnpm build:chat` and commit `api/_lib/assistant.js`.
- Behaviour unchanged: POST only, 400 for a bad message, 405 otherwise, and any failure answers `{ error, detail }` which the chat shows. Preview deployments are protected by Vercel Authentication, so `curl` gets 401; use the browser while logged in, or turn the protection off for the demo.
- Checked here: the function called directly under plain Node (POST, string body, GET 405, bad 400), 102 tests, `pnpm build:vercel`. Not checked here: the real Vercel deploy.

## Block 52: tool cards, follow-up suggestions and missing-data fallbacks (chat step 6, nothing committed)
- New things the assistant understands (`detectIntent`, rule-based, tested): the suppliers ("list the suppliers"), the project data / contracts, where the data comes from ("what is the data source?", "knowledge base", "documents"), and the evidence workbench (only when asked). A tool block is `{ type: 'tool', tool, projectId }`; the knowledge base and the evidence workbench work without a project (`projectId` null), suppliers and project data ask which project when none is known.
- Cards in the chat (`apps/shell/src/chat/`): `SuppliersCard` (the project's suppliers with history across projects, paged, click for contracts), `ContractsCard` (the project's contracts, public columns locked, tender facts Missing / Pending review / Entered), `KnowledgeCard` (source registry and documents, no search box or type filter, a document opens full screen), `EvidenceCard` (the evidence workbench page split into a card that works with or without a project).
- Every reply carries `suggestions`: follow-up prompts shown as the chat's chips (everything except what was just shown; before a project is chosen, the starter list including "What is the data source?").
- Missing data: `withDefaults` treats missing collections as empty so the assistant never throws on a half-filled data file; each card shows a "Missing information" note (`MissingInfo`) instead of a blank; every card sits inside `CardBoundary`, which replaces a crashing card with that note and a Try again button while the rest of the chat keeps working (2 tests).
- Learning labels the new feedback targets ("Chat · Suppliers card", "Chat · Contracts card", "Chat · Knowledge base card", "Chat · Evidence workbench card").
- The Vercel copy `api/_lib/assistant.js` was regenerated (`pnpm build:chat`); its sync test passes. 114 tests pass; `pnpm build:vercel` assembles. Checked in the browser: the data-source answer with the registry and 18 documents, the suppliers list (20 suppliers, paged), the contracts table with Missing chips, and the evidence workbench for a project with no conflicts (Missing note).

## Block 53: pre-ingested real data, stage 1 (nothing committed)
- Decision (K): not live, not CopilotKit. Real data is ingested ahead of time into a stored snapshot and the chat serves it per project. `pnpm ingest P158504` (`ingest/ingest.ts`, plain Node `fetch`, no new package, no key needed for this stage) reads the World Bank Projects API, the Contract Awards API (all 297 pages, because it ignores filters; about 2 minutes, cached in `ingest/cache`) and the Documents API, and writes `mock/ingested/P158504.json` with a manifest. `pnpm reset-db` merges every snapshot into `mock/db.json`, adding a line to the dataset label and three real sources to the registry.
- Parsing without a model (`ingest/parse.ts`, 11 tests): the supervision reports are semi-structured, so ratings, risk, fiduciary risk, disbursement (per loan, weighted), restructuring history and key dates are read by rules, across the three layouts the reports went through. Anything unreadable stays null and is listed in the manifest (here all 17 of 17 reports parsed). The reports use private-use bullet characters between cells; they are treated as spaces.
- P158504 Lao Road Sector Project 2: 1 project, 94 contracts (USD 38.4M, 87 suppliers; three reference numbers repeat because joint ventures are split per member), 20 documents (17 supervision reports, the completion report and its review, the appraisal document as pending, the latest procurement plan) with 308 text chunks, 17 supervision reports from 0% to 99.9% disbursed. The planned effectiveness date is not published, so the actual one is used for both (said in the manifest). Pages are exact for supervision reports and estimated for the other documents. 82 other documents and 49 older procurement plans exist and were not ingested.
- Not done (stage 2, needs a model): completion-report lessons and procurement-plan packages. Bidder counts, bid dates, amendments and tender drafts are not public and stay Missing. Planning, Tender design and the schedule show their Missing notes for this project.
- Checked in the browser: the project appears in the chat's suggestions, monitoring (17 reports, chart, no alerts, empty schedule note), suppliers (87, paged), and in the assistant's answers. `CLAUDE.md` rule 9 (no real project IDs) is relaxed for ingested snapshots, which are labelled as real in the dataset label and the source registry.
- Also: "one of the mock projects" stays among the mock ones; the project sentence names the sector; a document with unknown page count shows a dash; disbursement gaps show one decimal. 123 tests pass.
- `mock/db.json` must now be committed: it carries the ingested project and the Vercel functions read it.

## Status of the screens
| Screen | Where | State |
| --- | --- | --- |
| Planning | remote :5174 | Plans table with expandable read-only stage timeline, Edit plan / Full details / Close, full details page with Save (green) and Delete (red, confirmed). Three seeded plans with future dates. |
| Tender design | shell | Draft clauses first, plan as a collapsed line, comparison table with reference, difference and meaning per clause, gated benchmarks. Qualification card and assistant not built. |
| Monitoring | remote :5175 | KPIs, interactive disbursement chart directly under them, early-warning board (assign, evidence), key dates, governance card. |
| Learning | remote :5176 | Feedback queue (Accept, Edit, Reject), derived KPIs, coverage for the selected FY, update log, roadmap marked Proposed plan. |
| Project data | shell | Searchable contracts, role-gated entry, amendments, approval queue, audit trail. |
| Knowledge base, Evidence workbench | shell | Simple versions (registry with simulated Fetch, documents and chunks; one seeded conflict with Resolve). |

## Decisions and known data issues
- Plans are not linked to a contract or package record, so "Actual" in the stage timeline is always Missing. A plan-to-contract link would need a data-model change.
- Tender draft is one per project (compared with whichever plan is picked).
- Seeded contracts are mostly in FY2026; benchmarks stay gated (needs 10 with the value), by design.
- Governance values are illustrative placeholders (labelled).
- Palette: tokens in `packages/ui/src/tokens.css` (blue edit, green save, red close and delete, dotted dark-red Missing). A dark palette is defined under `data-theme="dark"` but there is no toggle and some screens still use light-only colours.
- The `apps/shell/@mf-types` files are tracked in git but regenerated by every build; consider ignoring them.

## Next: UI library (decision pending)
Goal: a uniform, smooth UI without choppy states. Options agreed so far:
1. Polish in-house in `@pi/ui` (tokens, shared Table, Stat, spacing, focus and hover states). No new dependencies, lowest risk.
2. shadcn/ui: needs Tailwind, Radix and a few more packages; best look and keyboard behaviour; real risk is Tailwind scanning across the federated remotes and keeping the CSS loaded once. Try it in a branch, starting with `@pi/ui` only (Button, Badge, Card, Table, Dialog), and keep it only if the federation, `vite preview` and Vercel builds all pass.
3. Bit.dev: swap `@pi/ui` components for Bit components re-exported from the same package, so screens do not change.
Needs K's choice before any dependency is added (CLAUDE.md: ask before adding dependencies beyond section 3).

## Not done
- No known-good git tag yet (`git tag -a demo-ready -m "Known-good build for the demo"` after the next commit K is happy with).
- Learning "Edit with note" not clicked through in the browser; the full six-step script has not been run as one continuous pass since the Planning, Tender design and Monitoring changes.
- No "New plan" button. No Playwright test. Qualification card, retrieval assistant, risk network, graph: not built.

## Next (wait for K)
Pick the UI library approach, then rehearse the full script from `./run.sh`, then tag.

## Block 54: CopilotKit chat backed by an OpenAI model (nothing committed)
- Server: `server/copilot.ts` mounts a CopilotKit runtime at `/api/copilotkit` on the assistant server (:3002) when `OPENAI_API_KEY` is set (read from git-ignored `.env.local`, see `.env.example`; `OPENAI_MODEL` optional, default `openai/gpt-4.1-mini`). Its tools (`list_projects`, `get_project_overview`, `find_contracts`, `get_supervision_reports`, `search_documents`) are pure lookups in `packages/data/src/assistantData.ts` over `mock/db.json`, so answers come from stored records and the model is told to cite chunk ids.
- Shell: `apps/shell/src/chat/CopilotPanel.tsx` is CopilotKit's `CopilotChat`. The model shows our cards through three frontend tools (`show_lifecycle`, `show_stage`, `show_tool`) that render the existing `BlockView`, so the cards keep reading live data and feedback still lands in Learning. `useCopilotAvailable` probes `/api/copilotkit/info`; with no key or no server the page keeps the rule-based chat unchanged.
- New dependencies (approved by K): `@copilotkit/runtime` (root), `@copilotkit/react-core` (shell); `zod` added to the shell's own dependencies.
- Verified: typecheck, 128 tests, runtime `/info`, shell mounts the chat and reaches OpenAI (a dummy key was rejected by OpenAI and the page shows that error). **Not verified:** a real model reply (no real key used by me), tool-card rendering with a real model, the `gpt-4.1-mini` name being available on K's account.
- Vercel: `api/copilotkit/[...path].js` (plain CommonJS) runs the runtime from `api/_lib/copilot.js`, generated from `server/copilot.ts` by `pnpm build:chat` (packages stay external; a test fails when it is stale). Without `OPENAI_API_KEY` it answers 404 and the page keeps the rule-based chat. Tested locally as a plain Node handler with and without a key; **not tested on Vercel itself** (dependency tracing, routing next to `api/[...path].js`, request timeout on long answers). Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in the Vercel project, then redeploy.
- CopilotKit runtime telemetry is on by default; opt-out is in its docs.

## Block 55: clicks in the chat cards, and the chat theme (nothing committed)
- Clicking a step in the donut (or any card control that calls `onSend`) now says it in the chat: `useSendToChat` in `apps/shell/src/chat/CopilotPanel.tsx` adds a user message to the CopilotKit agent and runs it. Before, `onSend` did nothing. Checked in the browser: Planning shows its 14 plans and timeline.
- Theme only: `CopilotPanel.module.css` points CopilotKit's colour variables (`--background`, `--primary`, `--border`, ...) at our tokens, so the chat follows the dark palette and `data-theme="light"`. Our values are copied to `--app-*` first because CopilotKit's names clash with ours. The input pill (`.copilotKitInput`) has its own white background and placeholder colour, overridden there. No layout or behaviour change.
