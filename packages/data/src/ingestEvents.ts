// The events an ingestion run emits, shared by the pipeline (Node) and the card that draws it (browser). Plain types, no logic beyond helpers.

export const INGEST_STAGES = ['find', 'project', 'contracts', 'documents', 'texts', 'parse', 'chunk', 'embed', 'publish'] as const
export type IngestStage = (typeof INGEST_STAGES)[number]

/** Short names for the stage row of the card. */
export const INGEST_STAGE_LABEL: Record<IngestStage, string> = {
  find: 'Find project', project: 'Project record', contracts: 'Contract awards', documents: 'Document list', texts: 'Read texts',
  parse: 'Parse reports', chunk: 'Chunk', embed: 'Embed', publish: 'Publish',
}

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export type IngestEvent =
  | { type: 'job'; jobId: string; projectId: string; startedAt: string }
  | { type: 'stage'; stage: IngestStage; status: Exclude<StageStatus, 'pending'>; detail?: string }
  /** Counted work inside a stage (contract pages, document texts, embedding batches). `found` is what the work has produced so far. */
  | { type: 'progress'; stage: IngestStage; done: number; total: number; found?: number; note?: string }
  /** One thing that appeared: a document, a parsed report or a document's chunks. Kept small; the card lists them as they arrive. */
  | { type: 'item'; stage: IngestStage; id: string; label: string; group?: string; count?: number; ok?: boolean }
  | { type: 'log'; text: string }
  | { type: 'done'; summary: IngestSummary }
  | { type: 'error'; stage: IngestStage | null; message: string; cancelled?: boolean }

export interface IngestSummary {
  projectId: string
  projectName: string
  counts: { contracts: number; documents: number; documents_with_text: number; chunks: number; supervision_reports: number }
  /** Embedding outcome. `skipped` says why nothing was embedded (no key, nothing to embed). */
  embedding: { status: 'done' | 'skipped'; reason?: string; model?: string; dimensions?: number; vectors?: number; tokens?: number; costUsd?: number; reused?: number } | null
  /** 2D positions of the embedded chunks (PCA), each [x, y] in 0..1, with the document type for colour. Null when nothing was embedded. */
  map: { chunk_id: string; doc_type: string; x: number; y: number }[] | null
  notes: string[]
  durationMs: number
}

/** What the discovery step returns for a name or id. */
export interface ProjectCandidate {
  project_id: string
  project_name: string
  country: string
  status: string
  approval_date: string | null
  sector: string | null
  /** True when this project is already stored in the app. Filled in by the server, which can see the data file. */
  stored?: boolean
}

export const isProjectId = (s: string) => /^P\d{6}$/.test(s)

/** Folds an event into the card's view of the run. Pure, so the card and its test share it. */
export interface RunView {
  jobId: string | null
  projectId: string | null
  stages: Record<IngestStage, { status: StageStatus; detail?: string; done?: number; total?: number; found?: number; note?: string }>
  items: Extract<IngestEvent, { type: 'item' }>[]
  log: string[]
  summary: IngestSummary | null
  error: { stage: IngestStage | null; message: string; cancelled?: boolean } | null
}

export const emptyRun = (): RunView => ({
  jobId: null, projectId: null,
  stages: Object.fromEntries(INGEST_STAGES.map((s) => [s, { status: 'pending' as StageStatus }])) as RunView['stages'],
  items: [], log: [], summary: null, error: null,
})

const MAX_ITEMS = 400
const MAX_LOG = 60

export function applyEvent(run: RunView, e: IngestEvent): RunView {
  switch (e.type) {
    case 'job': return { ...run, jobId: e.jobId, projectId: e.projectId }
    case 'stage': return { ...run, stages: { ...run.stages, [e.stage]: { ...run.stages[e.stage], status: e.status, detail: e.detail ?? run.stages[e.stage].detail } } }
    case 'progress': return { ...run, stages: { ...run.stages, [e.stage]: { ...run.stages[e.stage], done: e.done, total: e.total, found: e.found ?? run.stages[e.stage].found, note: e.note ?? run.stages[e.stage].note } } }
    case 'item': return { ...run, items: [...run.items, e].slice(-MAX_ITEMS) }
    case 'log': return { ...run, log: [...run.log, e.text].slice(-MAX_LOG) }
    case 'done': return { ...run, summary: e.summary }
    case 'error': {
      const stages = e.stage ? { ...run.stages, [e.stage]: { ...run.stages[e.stage], status: 'failed' as StageStatus, detail: e.message } } : run.stages
      return { ...run, stages, error: { stage: e.stage, message: e.message, cancelled: e.cancelled } }
    }
  }
}
