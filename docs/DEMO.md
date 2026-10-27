# Demo script and live-edit guide

## Before every rehearsal
```
pnpm reset-db        # restores the seed (also clears feedback, entries, alerts, audit log)
pnpm api             # :3001
pnpm --filter @pi/planning dev     # :5174
pnpm --filter @pi/monitoring dev   # :5175
pnpm --filter @pi/learning dev     # :5176
pnpm --filter @pi/shell dev        # :5173
```
Open http://localhost:5173. Role is stored in localStorage; the role switcher is in the top bar.
If you restart the API after reset-db, refresh the browser.

## The six-step script (project P-MOCK-001, FY2026)
1. **Select** project and fiscal year in the top bar. Every screen follows them. Point at the Mock data banner and the coverage meter (2 of 6).
2. **Planning** (role Planner): change a planned date, Save plan; the "advertisement to signing" KPI recomputes. Note the gated restructuring and duration cards (3 of 30), the GPPD country reference (Public chip), and the Withheld recommendation. Click a citation chip to open the SourceDrawer. Click **Not helpful** on the first recommendation.
3. **Tender design** (Planner): change Bid validity 60 → 90. The finding flips from "ends before planned signing" to "covers". The benchmark stays Missing (needs 10 contracts) with a link to Project data. Save draft.
4. **Project data**: as Contract manager, pick REF-004, field Contract end date, value 2026-04-30, Submit. Add an amendment too. Switch role to Reviewer and Approve both. The coverage meter goes 2 → 3 of 6. Optional: enter bids opened before advertised on REF-001 to show validation.
5. **Monitoring**: a new alert, "Contract past its end date", appears. Assign it, open See evidence (SourceDrawer shows the entered record). Show the disbursement chart below the on-pace line.
6. **Learning** (Reviewer): the Not helpful feedback is in the queue. Reject it. "Feedback accepted" now shows 0 of 1 reviewed, and the update log gained the decision.

## Live edits: where to change things
| Want to change | Edit |
| --- | --- |
| A threshold (gate sizes, lag points) | `packages/config/src/index.ts` → `THRESHOLDS` |
| Who can do what | same file → `PERMISSIONS` |
| Seed data (contracts, reports, chunks, recommendations, plan, as-of date) | `mock/seed.ts`, then `pnpm reset-db`. Or edit `mock/db.json` directly while the API runs (json-server reloads it) |
| Fiscal-year list | `FISCAL_YEARS` in `packages/config/src/index.ts` |
| Add an entered field | add it to `ENRICHMENT_FIELDS` in `packages/data/src/schemas.ts` and a label in `FIELD_LABEL` (`apps/shell/src/pages/ProjectData.tsx`) |
| An alert rule | `deriveAlerts` in `packages/data/src/selectors.ts` |
| Country indicators shown | `INDICATORS` in `apps/planning/src/Planning.tsx` |
| Colours and fonts | `packages/ui/src/tokens.css` |

Tip: to make the lag alert disappear live, change `disbursementLagPoints` to 30 and refresh Monitoring.

## Known gaps to say out loud
Planned screens (Knowledge base, Evidence workbench, qualification card, assistant, risk network) show a "Planned" state. Governance values are illustrative. Duration and restructuring models are gated because only 3 completion reports exist.

## Tests
`pnpm test` runs the selector tests (fiscal year, coverage, tender comparison, alerts). `pnpm typecheck` checks all packages.
