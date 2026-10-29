# Ingested snapshots

Each `P<number>.json` here is the result of `pnpm ingest P<number>`: one real World Bank project read from the public APIs and stored in the same shape as `mock/db.json`. `pnpm reset-db` merges every snapshot into `db.json`, so the app and the chat show it like any other project.

A snapshot has a `manifest` (sources and URLs, fetch time, counts, what was not done, notes, licence) and `collections` (projects, contracts, documents, chunks, supervision_reports, sources).

Stage now: **structured**. Contracts, documents and text chunks come straight from the APIs; supervision reports are read from the report text by a parser (no model). Not done yet (needs a model): completion-report lessons and procurement-plan packages. Bidder counts, bid dates, amendments and tender drafts are not in any public structured source and stay Missing.

Data: World Bank open data (CC BY 4.0), attribute the World Bank. Some completion-report text is a disclosed draft; check before sharing. The raw API responses are cached in `ingest/cache` (not committed).
