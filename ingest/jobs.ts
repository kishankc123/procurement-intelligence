// Runs ingestions in the background for the assistant server. A job keeps every event it emitted, so a card that connects late (or reconnects)
// replays the run from the start. One job runs at a time: the contract scan is heavy and there is one data file to write.
import { randomUUID } from 'node:crypto'
import { isProjectId, type IngestEvent } from '../packages/data/src/ingestEvents'
import { Cancelled, ingestProject, type Embedder, type PipelineIo } from './pipeline'
import { DEFAULT_DIRS, previousVectors, publishResult, type Dirs } from './publish'

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  projectId: string
  status: JobStatus
  events: IngestEvent[]
  startedAt: string
}

export interface RunnerDeps {
  io: () => PipelineIo
  /** The embedding model, or null with the reason. Read on each start, so a key added to .env.local is seen after a restart only; the card shows the reason. */
  embedder: () => { embedder: Embedder | null; reason?: string }
  dirs?: Partial<Dirs>
  /** Replaces publishResult in tests. */
  publish?: typeof publishResult
  keepJobs?: number
}

type Listener = (event: IngestEvent, index: number) => void

export function createJobRunner(deps: RunnerDeps) {
  const jobs = new Map<string, Job & { ctl: AbortController; listeners: Set<Listener> }>()
  const publish = deps.publish ?? publishResult
  const keep = deps.keepJobs ?? 20
  const running = () => [...jobs.values()].find((j) => j.status === 'running')

  const push = (job: Job & { listeners: Set<Listener> }, e: IngestEvent) => {
    job.events.push(e)
    for (const l of job.listeners) l(e, job.events.length - 1)
  }

  function start(projectId: string, opts: { fresh?: boolean } = {}): { ok: true; job: Job; alreadyRunning?: boolean } | { ok: false; status: number; message: string } {
    if (!isProjectId(projectId)) return { ok: false, status: 400, message: 'A World Bank project id looks like P158504 (the letter P and six digits).' }
    const busy = running()
    if (busy) {
      if (busy.projectId === projectId) return { ok: true, job: busy, alreadyRunning: true }
      return { ok: false, status: 409, message: `Another ingestion is running (${busy.projectId}). Wait for it to finish or cancel it.` }
    }
    const job = { id: randomUUID(), projectId, status: 'running' as JobStatus, events: [] as IngestEvent[], startedAt: new Date().toISOString(), ctl: new AbortController(), listeners: new Set<Listener>() }
    jobs.set(job.id, job)
    while (jobs.size > keep) { const oldest = [...jobs.values()].find((j) => j.status !== 'running'); if (!oldest) break; jobs.delete(oldest.id) }
    push(job, { type: 'job', jobId: job.id, projectId, startedAt: job.startedAt })
    void run(job, opts)
    return { ok: true, job }
  }

  async function run(job: Job & { ctl: AbortController; listeners: Set<Listener> }, opts: { fresh?: boolean }) {
    let failed = false
    try {
      const { embedder, reason } = deps.embedder()
      const io = deps.io()
      const result = await ingestProject(job.projectId, {
        io: opts.fresh ? { ...io, cache: { get: () => undefined, put: io.cache.put } } : io,
        embedder, noEmbedderReason: reason, signal: job.ctl.signal, previous: previousVectors(job.projectId, deps.dirs?.embeddings ?? DEFAULT_DIRS.embeddings),
        onEvent: (e) => { if (e.type === 'error') failed = true; push(job, e) },
      })
      try {
        publish(result, { dirs: deps.dirs })
      } catch (e) {
        failed = true
        push(job, { type: 'error', stage: 'publish', message: `The files could not be written: ${e instanceof Error ? e.message : e}` })
        job.status = 'failed'
        return
      }
      push(job, { type: 'stage', stage: 'publish', status: 'done', detail: 'Added to the app' })
      push(job, { type: 'done', summary: result.summary })
      job.status = 'done'
    } catch (e) {
      // The pipeline already pushed an error event for its own failures; anything else (a bug before the first stage) is reported here.
      if (!failed) push(job, { type: 'error', stage: null, message: e instanceof Error ? e.message : String(e) })
      job.status = e instanceof Cancelled ? 'cancelled' : 'failed'
    }
  }

  return {
    start,
    get: (id: string): Job | undefined => jobs.get(id),
    running,
    cancel(id: string): boolean { const j = jobs.get(id); if (!j || j.status !== 'running') return false; j.ctl.abort(); return true },
    /** Calls `cb` with every event from index `from` on (the past ones at once, then new ones as they happen). Returns the unsubscribe function. */
    subscribe(id: string, from: number, cb: Listener): (() => void) | null {
      const j = jobs.get(id)
      if (!j) return null
      for (let i = Math.max(0, from); i < j.events.length; i++) cb(j.events[i]!, i)
      j.listeners.add(cb)
      return () => { j.listeners.delete(cb) }
    },
  }
}

export type JobRunner = ReturnType<typeof createJobRunner>
