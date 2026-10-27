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

## Next (Day 1 hours 5-10 leftovers, then Day 2)
Project data page (role-gated entry + approval), Monitoring remote (alerts from `deriveAlerts`, evidence drawer, one chart), Learning remote (feedback queue, KPIs, update log), thin Tender design route, Vitest on three selectors, DEMO.md, ARCHITECTURE.md.

## Notes
- Governance values in the seed are illustrative placeholders (covered by the Mock data label). Replace with real WGI/CPIA before sharing outside the demo.
- Planning's duration curve is gated: only 3 completion reports exist, threshold is 30. Honest, not a bug.
- `gppd_data.json` (23 MB) is git-ignored.
