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
