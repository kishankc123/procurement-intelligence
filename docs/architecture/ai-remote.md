# Micro front-end: `ai` ("Work with AI", `apps/ai`, port 5177)

Federation name `ai`. The earlier, page-based version of the AI features, from before the product became a chat. It still works and is reachable at `/work-with-ai`, but the chat is where new work happens. Read `README.md` first.

## Exposed modules

| Module | File | What it is | Used by |
|---|---|---|---|
| `./WorkWithAI` | `src/WorkWithAI.tsx` (default export) | One page with five numbered **layers** for the selected project | Shell route `/work-with-ai` |

It exposes only the page; none of its pieces are drawn in the chat. (A few of its ideas became chat cards written in the shell, for example the specification checks on the tender draft.)

## The five layers (each is a `Card` with a provenance chip and ends with `LayerFeedback`)

1. **Connect a source link**: paste a link, check it against `KNOWN_SOURCE_HOSTS` (`@pi/config`), save it to the project (`source_links`, permission `add_source_link`). Provenance: entered.
2. **Run ingestion**: a **Simulated** step list (a deterministic function, labelled Simulated) of what ingestion would do for the saved link; each run is stored in `ingestion_runs` (`useRecordIngestionRun`). It does not fetch anything.
3. **Link structured records to document text**: contracts and supervision reports are structured, document chunks are free text; a pair is linked when a rule connects them (the text names a contract reference, or a report and a document share the project and the same date, or the text names the project). Derived, with the number of links.
4. **Check for a retender**: earlier tenders that look like the one being checked, one at a time (a scrolling box showing a single match with a counter), from `tender_history` (`retender.ts`).
5. **Check the tender specification**: rule checks of a tender draft against the plan, the contracts and the guidance note (`spec.ts`, `SPEC_RULES` in `@pi/config`); each check is pass, warn, fail or "not checkable" with its reason.

Every layer ends with "Was this useful?" (`FeedbackWidget`, target `AI-LAYER-<layer>-<projectId>`), which feeds the Learning queue.

## Data it uses

Reads: `useSourceLinks`, `useIngestionRuns`, `useTenderHistory`, `useTenderDraft`, `useAllPlans`, `useContracts`, `useReports`, `useDocs`, `useChunks`, `useCountryYears`, `useProject`, `useProjects`, `useUiStore`, `useCurrentUser`. Writes: `useAddSourceLink`, `useRecordIngestionRun`. Pure helpers live in `packages/data/src/ai.ts` ("no React, no fetch: easy to test and to explain"), `retender.ts` and `spec.ts`.

## Rules specific to this remote

- Anything simulated says **Simulated**; nothing here calls a real model or a real source.
- Mock documents are titled "Mock ..." and ids look like `P-MOCK-001`; never imitate real World Bank documents.
- Roles gate the controls and say why when disabled.

## Files

`WorkWithAI.tsx`, `WorkWithAI.module.css`, `bootstrap.tsx` and `main.tsx` (standalone dev entry), `env.d.ts`.

## Tests and checks

`ai.test.ts`, `retender.test.ts`, `spec.test.ts` in `packages/data/src/`. `pnpm --filter @pi/ai typecheck`.
