# Procurement Intelligence

Front-end demo of an AI-powered procurement intelligence platform, built on World Bank open data. The backend is mocked. Mock data and simulated results are labelled as such in the UI.

React 19, TypeScript, Vite, a pnpm monorepo, and micro-frontends via Module Federation.

## Requirements

- Node 22.x
- pnpm 9.15.9 (pinned in `package.json`; corepack installs it)

## Setup

```bash
./setup.sh
```

This runs `pnpm install --frozen-lockfile`, which installs exactly the versions in `pnpm-lock.yaml`. Run it again any time `node_modules` is deleted.

Then copy `.env.example` to `.env.local` and fill it in. `OPENAI_API_KEY` is needed for the assistant. `.env.local` is git-ignored, so never commit it.

## Run

```bash
./run.sh          # demo mode: reset data, build, serve the production build
./run.sh dev      # dev mode with hot reload
./run.sh keep     # demo mode, but keep the current mock/db.json
```

Open http://localhost:5173.

| Port | Service |
| --- | --- |
| 3001 | Mock API (json-server on `mock/db.json`) |
| 3002 | Assistant server |
| 5173 | Shell (host) |
| 5174 to 5177 | Remotes: planning, monitoring, learning, ai |

## Layout

```
apps/       shell (host), planning, monitoring, learning, ai (remotes)
packages/   ui, domain, data, config, events (shared)
mock/       db.json, seed script, GPPD import, ingested projects
ingest/     ingestion pipeline for real project documents
server/     assistant server
api/        Vercel functions
scripts/    build and hosting scripts
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | All apps in dev mode |
| `pnpm build` | Build all apps |
| `pnpm demo` | Build, then serve with `vite preview` |
| `pnpm api` | Mock API on :3001 |
| `pnpm assistant` | Assistant server on :3002 |
| `pnpm reset-db` | Restore the seed data in `mock/db.json` |
| `pnpm import-gppd` | Normalize `gppd_data.json` into the mock data |
| `pnpm ingest` | Ingest a project's documents (see also `ingest:notices`, `ingest:plans`, `ingest:index`, `ingest:small`) |
| `pnpm typecheck` | Typecheck every package |
| `pnpm test` | Run Vitest |
| `pnpm build:vercel` | Build and assemble for Vercel |

## Docs

Local notes live in `docs/` (git-ignored): `DEMO.md` (demo script and where to make live edits), `ARCHITECTURE.md`, `HOSTING.md` and `PROGRESS.md`.
