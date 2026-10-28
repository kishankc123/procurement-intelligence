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
