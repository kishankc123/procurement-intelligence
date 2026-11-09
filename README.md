# ProcureIntel: branch guide

ProcureIntel is a front-end demo of an AI-assisted procurement intelligence platform on World Bank open data. It is built with React 19, TypeScript, Vite and a pnpm monorepo, with micro front-ends (a shell plus four remotes) joined by Module Federation.

The work lives on several branches. This guide says what each one holds and which one to open to see a given feature.

**Live deployment:** https://procurement-intelligence-p7q751lm8-kishans-projects-3ea8dea8.vercel.app/
It was built from `feat/ingestion` (commit `9adc717`), so it shows the chat-first app, not `main`.

## Which branch should I look at?

| I want to see | Branch |
| --- | --- |
| The stable, original dashboard (Planning, Tender design, Monitoring, Learning and more) on labelled sample data | `main` |
| The chat-first assistant with real World Bank projects and the CopilotKit chat | `chatbot` |
| Everything: the chat, live ingestion of new projects, the analyst tools, docs and the presentation | `feat/ingestion` (latest, and what is deployed) |
| Nothing separate: `feat/ai-features`, `feat/shadcn-ui`, `shadcn-ui` | Already merged into `main` (see below) |

## How the branches relate

```
main  <--  feat/shadcn-ui   (PRs #1 and #2, merged)
main  <--  feat/ai-features (PRs #3 to #6, merged)
   \
    chatbot  (42 commits ahead of main, not merged)
       \
        feat/ingestion  (chatbot plus 33 more commits, not merged)
```

`feat/ingestion` contains every commit of `chatbot`, so it is a superset. `main` does not contain either of them yet.

## Branch details

### `main`: the dashboard version

Merged state of the shadcn and ai-features work. A dashboard with five micro front-ends and a mock API; no assistant server and no OpenAI key needed.

- **Shell:** filter rail (project, fiscal year, role switcher), a minimal top bar, breadcrumbs and a back button, a phone and tablet layout, a visible mock data label.
- **Planning:** plans list with an expandable stage timeline, a calendar of the tender stages, a full-details page, and an Edit plan modal with a delete confirmation.
- **Tender design:** draft clauses, charts comparing the draft with the plan and benchmarks (gated by sample size), and specification checks.
- **Monitoring:** KPI carousel, an interactive disbursement-vs-time chart, a project schedule Gantt chart, an early-warning board (urgent first, Assign, See evidence) and key dates.
- **Learning:** feedback queue (Accept, Edit, Reject), contract data readiness chart, coverage by fiscal year and the update log.
- **Project data, Knowledge base, Evidence workbench, Suppliers, Project overview:** role-gated entry and approval, documents opened full screen, one seeded conflict with Resolve, supplier profiles.
- **Work with AI (remote on :5177):** source links, a simulated ingestion run, record linking shown as a tree, retender check, specification checks.
- **Shared:** provenance chips on every value (Public, Entered, Derived, Missing), shadcn/ui components, paging, carousels and skeleton loaders.

Run it:

```bash
pnpm install --frozen-lockfile
./run.sh          # reset data, build, serve; open http://localhost:5173
./run.sh dev      # hot-reload dev servers instead
```

Ports: mock API 3001, shell 5173, remotes 5174 to 5177. Docs: `docs/` (`DEMO.md`, `ARCHITECTURE.md`, `PROGRESS.md`).

### `feat/ai-features` and `feat/shadcn-ui` (and the older local `shadcn-ui`)

Both are fully merged into `main` and have no commits of their own beyond it. They are kept only as history.

- `feat/shadcn-ui`: introduced shadcn/ui, the filter rail and top bar, and the phone and tablet layouts.
- `feat/ai-features`: introduced the Work with AI remote, supplier profiles, the schedule, paging and the document full-screen view.
- `shadcn-ui` (local only, no remote): an older copy of the shadcn work. Safe to delete.

### `chatbot`: the chat-first assistant

Turns the app into a chat. 42 commits ahead of `main`.

- **Chat landing and assistant server** (Node, port 3002), with a rule-based fallback when no model is available.
- **CopilotKit chat backed by an OpenAI model:** a runtime with tools that read the stored data, written guardrails (draw the view first, real and mock data never mixed, honest "I don't know"), and a theme that matches the app.
- **Review mode and suggest mode:** review shows only what is on record for a stored project; suggest builds a plan, tender clauses, suppliers, monitoring and learning options for your own procurement from medians of similar real projects.
- **My lifecycle:** build it from suggestions, edit and save as final, open it from a bubble anywhere in the chat, and download it as Word or PNG.
- **Real data:** pre-ingested World Bank road projects (P158504 first, then six more), including their supervision reports, procurement plans and tender notices.
- **Cards in the chat:** project comparison (bars and scatter plot), a supplier world map, plan calendar, suppliers, contracts, knowledge base and evidence.
- **Phone layout** for the chat and its cards, and Vercel functions (`api/chat.js`, `api/copilotkit`).
- **Docs:** `docs/architecture/` describes each micro front-end and the Copilot runtime.

Needs `OPENAI_API_KEY` in `.env.local` for the model chat. Copy `.env.example` to `.env.local` and fill it in. Without a key the rule-based chat answers instead.

```bash
pnpm install --frozen-lockfile
./run.sh dev      # adds the assistant server on :3002 to the dashboard ports
```

### `feat/ingestion`: everything, plus live ingestion

All of `chatbot` plus 33 commits. This is the most complete branch and the one deployed to Vercel.

- **Live ingestion:** ask about a World Bank project the app does not hold, and the chat offers a Proceed button. Only the user can start it. The card follows the run: project record, contract awards, documents, tenders, procurement plan, text chunks and embeddings.
- **Search by meaning:** document search by embeddings plus keywords, with a similarity floor and a "No supporting evidence found" answer.
- **Tenders and plans:** ingests Invitation for Bids notices and the first rows of procurement plans (checked row by row against the document text).
- **Hosted ingestion on Vercel:** a resumable, stateless step handler with a Blob store and a prebuilt contract index (switched on with `INGEST_TOKEN`).
- **Analyst tools and standard:** risk, data-gap and comparable-project analysis, with a written standard in `docs/ANALYST_STANDARD.md`.
- **Chat polish:** the chat survives reloads for the browser tab, a donut loader while the assistant is checked, the project in context, no suggested dates before today, one ingestion at a time, and the filter rail only on the dashboard pages.
- **Project files:** `README.md`, `setup.sh`, `docs/HOSTING.md`, and the presentation (`Procurement-Intelligence.pptx` and `.pdf`, with `deck-assets/`).

```bash
./setup.sh        # installs exactly the versions in pnpm-lock.yaml
./run.sh          # demo mode; or ./run.sh dev for hot reload
```

Live ingestion works locally with the assistant server (`pnpm assistant`). On the hosted site it needs `INGEST_TOKEN` and a Blob store; see `docs/HOSTING.md` on this branch.

## How to switch and view a branch

```bash
git fetch origin
git switch chatbot          # or main, feat/ingestion
pnpm install --frozen-lockfile
./run.sh dev                # then open http://localhost:5173
```

Notes:

- Requirements: Node 22.x and pnpm 9.15.9 (pinned in `package.json`).
- `.env.local` and `ingest/cache` are not tracked, so they stay in your folder when you switch branches. `.env.local` holds the OpenAI key; never commit it.
- Dependencies differ between branches (CopilotKit, `docx`, `html-to-image` and others appear from `chatbot` on), so run `pnpm install --frozen-lockfile` after each switch.
- Stop `./run.sh` before switching, so the ports are free.
