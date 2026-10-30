# Live ingestion on the hosted (Vercel) site

Locally, ingestion runs inside the assistant server (`pnpm assistant`) and writes files. A Vercel function cannot do that: its disk is read-only and wiped, requests are short, and nothing stays in memory between them. The hosted version keeps everything in a **Blob store** and splits a run into short requests that the browser drives.

*Status: built and tested on fixtures and a fake Blob SDK only. It has not been run against a real Vercel project, Vercel Blob, worldbank.org or OpenAI. Expect small fixes on the first real run.*

## How it works

1. **The contract index.** The public contract-awards list has to be read page by page to find one project's contracts (minutes). `pnpm ingest:index` reads it once and writes an index grouped by project (100 shards, `contracts-index/NN.json.gz`, plus `contracts-index/meta.json`). A hosted ingest then reads one small shard. Rebuild it when you want newer awards; an ingest notes the index date in the project's notes.
2. **Steps.** The card asks `POST /api/ingest/start`, then `POST /api/ingest/step` repeatedly. Each step runs the same pipeline as the local server with a time budget (`INGEST_STEP_BUDGET_MS`, default 40 s). When the budget is spent the pipeline stops at a safe point and the step answers `paused`; the next step continues from the cache (`cache/*.json.gz` in the store: the project record, document list, texts, paid embedding batches). The last step publishes the project and answers `done`.
3. **Publishing.** The snapshot goes to `ingested/<id>.json` and the vectors to `embeddings/<id>.json` and `.bin`. The data API (`api/[...path].js`) and the chat function merge new snapshots from the store into their in-memory copy of `db.json` at most every 5 seconds, so every visitor sees the project and the chat can search it by meaning.
4. **Access.** `INGEST_TOKEN` must be set, and the browser sends it in `X-Ingest-Token` (the card asks for it once per tab and keeps it in `sessionStorage`). There is a daily limit (`INGEST_DAILY_LIMIT`, default 5 runs started) and a cap of `INGEST_MAX_CHUNKS` (default 3000) chunks embedded per project. Without the token variable, ingestion is off and the card says so.

## Set-up

1. In the Vercel dashboard, open the project, then **Storage**, and create or connect a **Blob** store. Note whether it is **private** or **public**. This sets `BLOB_READ_WRITE_TOKEN` for the project.
2. In **Settings, Environment Variables**, add `INGEST_TOKEN` (a long random string), keep `OPENAI_API_KEY` (already used by the chat), and add `INGEST_BLOB_ACCESS=public` only if the store is public (the default is private).
3. Build the contract index once, from a computer with network access:
   ```bash
   vercel env pull .env.local
   ```
   ```bash
   pnpm ingest:index
   ```
   (It writes to Blob when `BLOB_READ_WRITE_TOKEN` is in `.env.local`, otherwise to `ingest/cache/store`. It reads every page of the public list and needs a few hundred MB of memory.)
4. Deploy. Open the chat, ask about a World Bank project that is not stored, press **Ingest this project**, enter the token.

## Function limits to check

`vercel.json` sets `maxDuration: 60` for `api/ingest/[...path].mjs`, and a step budget of 40 s leaves room for the work in flight. Your plan's maximum may be lower or higher. If a deploy rejects 60, lower `maxDuration` and `INGEST_STEP_BUDGET_MS` together (for example 10 s and 6000 ms): a smaller budget only means more steps, but a single document download or embedding batch must still fit inside one request.

## Things to verify on the first real run

- The `@vercel/blob` calls in `ingest/store.ts` (`put`, `get`, `list`) match your store type. The code compiles against the installed SDK (2.8.2) but has not run against a real store.
- How long a step really takes with real downloads, and whether 40 s is the right budget.
- The embedding similarity floor (`MIN_SIMILARITY`, 0.30 in `server/semantic.ts`) on real questions.
- Cold-start cost: each new function instance reads every published snapshot (a few MB each) from the store before it answers. Compressing snapshots is the first thing to do if that is slow.

## What is not covered

Cancel on the hosted site only stops the browser asking for more steps; work already started in a request finishes. Two browsers ingesting the same project at once can repeat some work (the cache makes this harmless). Deleting a project from the store is not built: remove its `ingested/`, `embeddings/` and `cache/` keys in the dashboard.
