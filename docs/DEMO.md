# Demo script and live-edit guide

## Before every rehearsal (demo from the preview build, not the dev servers)
```
pnpm reset-db        # restores the seed (also clears feedback, entries, alerts, audit log)
pnpm api             # :3001, leave running in one terminal
pnpm demo            # builds all five apps, then serves them with vite preview on :5173-5177
```
Rebuild (`pnpm demo`) after any code change; `pnpm reset-db` only needs the API running. For live code edits use the dev servers instead:
`pnpm dev` runs all four apps in dev mode.
Open http://localhost:5173. Role is stored in localStorage; the role switcher is in the top bar.
If you restart the API after reset-db, refresh the browser.

## Start with the assistant
Open the landing page and type "help me with one of the mock projects" (or click a suggestion). The Node assistant server (`pnpm assistant`, started by `./run.sh`) answers: watch the agent run log (simulated services), then the "Your procurement solution is ready" card, and open any of the four stages. Replies are rule-based over the mock data and say so.

## The six-step script (project P-MOCK-001, FY2026)
1. **Select** project and fiscal year in the top bar. Every screen follows them. Point at the Mock data banner and the coverage meter (15 of 28 contracts have approved entered data).
2. **Planning** (role Planner): change a planned date, Save plan; the "advertisement to signing" KPI recomputes. Note the gated restructuring and duration cards (3 of 30), the GPPD country reference (Public chip), and the Withheld recommendation. Click a citation chip to open the SourceDrawer. Click **Not helpful** on the first recommendation.
3. **Tender design** (Planner): change Bid validity 60 → 90. The finding flips from "ends before planned signing" to "covers". The bid validity benchmark shows (12 contracts have it). The contract duration benchmark stays Missing: 9 of the 10 contracts it needs, with a link to Project data. Save draft.
4. **Project data**: as Contract manager, pick REF-004, field Contract end date, value 2026-04-30, Submit. Add an amendment too. Switch role to Reviewer and Approve both. The coverage meter goes 15 → 16 of 28, and the duration benchmark on Tender design unlocks (10 of 10). Optional: enter bids opened before advertised on REF-001 to show validation.
5. **Monitoring**: a third "Contract past its end date" alert appears (two come from the seed). Assign it, open See evidence (SourceDrawer shows the entered record). Show the disbursement chart below the on-pace line.
6. **Learning** (Reviewer): the Not helpful feedback is in the queue. Reject it. the reviewed and accepted figures change, and the update log gains the decision. The queue already holds 16 seeded items, so it pages at 10.

7. **Evidence workbench** (Reviewer, optional): the open conflict (REF-002 advertised after it was signed) shows both sources with chips and citations. Resolve: keep public value; the entered record is rejected and the provenance trail updates. Reset restores it.
8. **Knowledge base** (optional): press Fetch on a source (simulated, labelled), search documents, open a document to see its chunks.

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
Not built: the qualification card, the retrieval assistant on Tender design, the risk network, the knowledge graph and pipeline view. Knowledge base and Evidence workbench are simple versions (one conflict, simulated fetch). Governance values are illustrative. Duration and restructuring models are gated because only 3 completion reports exist.

## Tests
`pnpm test` runs the selector tests (fiscal year, coverage, tender comparison, alerts). `pnpm typecheck` checks all packages.

## Seeded volumes (mock/seed-extra.ts)
So lists page and scroll: P-MOCK-001 has 28 FY2026 contracts (32 in all), 14 plans, 17 amendments across the project (8 approved, 4 pending, 1 rejected on P-MOCK-001), 16 contract milestones added, 22 documents, 30 chunks, 16 feedback items, about 165 update-log entries, 12 source links and 8 ingestion runs. P-MOCK-002 and P-MOCK-003 now have contracts, plans, a tender draft and supervision reports. To add more of anything, add a row in `mock/seed-extra.ts` and run `pnpm reset-db`.
