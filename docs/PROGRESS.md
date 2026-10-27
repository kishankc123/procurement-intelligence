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
pnpm reset-db
pnpm api                          # :3001
pnpm --filter @pi/planning dev    # :5174 (start the remote first)
pnpm --filter @pi/shell dev       # :5173
```

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

## Block 4: rehearsal pass, done (nothing committed)
- `pnpm build` + `vite preview` verified: all five screens load through federation from the production build, no console errors. `pnpm demo` builds and serves everything.
- Knowledge base (registry with simulated Fetch, document search/filter, chunk detail) and Evidence workbench (one seeded conflict with Resolve, provenance trail, grounding table) added as shell pages. New collections: `sources`, `conflicts`; seed adds entered record ENR-S5 to create the conflict.
- Checked all 7 screens at 1440x900: no horizontal overflow, no empty links. Resolve conflict, Fetch and doc detail verified in the browser.

## Block 5: filter wiring, done (nothing committed)
- Planning now shows which fiscal year the planned signing falls in and flags a plan outside the selected FY. Learning's coverage table follows the selected FY (empty state otherwise).
- Checked in the browser: FY2026 -> FY2025 changes both screens; Planner sees amendment and contract-end entry disabled with a reason.

## Block 6: Planning list and detail, done (nothing committed)
- Planning now opens on a list of plans (one row per tender being prepared). Open a plan to see its editable stage table (planned dates, actual, reference), KPIs, duration and restructuring gates, country context, recommendations and similar projects. Back to plans returns to the list.
- Data model change: `plans` gained `name`; seed now has three plans (works, goods, consulting) with future dates, replacing the single plan whose dates were in the past.
- Revised: the whole row is clickable (mouse, Enter or Space). The selected plan's stage timeline expands inside the same table, directly under its row, like a dropdown, with Full details and Close (clicking the row again also closes it); Full details opens the full page (KPIs, gates, country context, recommendations, similar projects), Back to plans returns.
- Revised again: the dropdown timeline is read-only (planned, actual, reference) with Edit plan (blue), Full details and Close at the bottom. Edit plan opens the full details page with the plan editable at the top: Save plan (green), Cancel, Delete plan (red, asks to confirm). Full details opens the same page read-only with an Edit plan button. New `useDeletePlan` hook; Button gained `success` and `danger` variants. Deleting is logged to `audit_log`.
- Tender design still reads the first plan of the project. Adding a plan picker there is not done. No "New plan" button yet.

## Not done
- No known-good git tag (K asked not to commit; tag after K commits).
- Learning "Edit with note" not clicked through; full six-step script not run as one continuous pass.
- No Playwright test. Qualification card, retrieval assistant, risk network, graph: not built.

## Next (wait for K)
K reviews and commits; rehearse the full script once from `pnpm reset-db` + `pnpm demo`; tag the commit.
