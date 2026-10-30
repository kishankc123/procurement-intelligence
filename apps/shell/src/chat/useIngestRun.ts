import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ASSISTANT_BASE } from '@pi/config'
import { applyEvent, emptyRun, type IngestEvent, type RunView } from '@pi/data'

export type RunPhase = 'idle' | 'starting' | 'running' | 'done' | 'failed' | 'cancelled'

/** Jobs this tab started, by project, so a card that is drawn again (the chat list re-mounting) picks the same run up instead of starting another. */
const started = new Map<string, string>()

/**
 * Starts an ingestion on the assistant server and follows it as server-sent events. The run replays from its first event whenever the card
 * attaches, so a re-mounted or reconnected card shows the same picture. Events are applied at most once per animation frame: a cached contract
 * scan emits hundreds of progress events a second and the page only needs the latest.
 */
export function useIngestRun(projectId: string | null) {
  const queryClient = useQueryClient()
  const [run, setRun] = useState<RunView>(emptyRun)
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const [lost, setLost] = useState(false)
  const source = useRef<EventSource | null>(null)
  const jobId = useRef<string | null>(null)
  const queue = useRef<IngestEvent[]>([])
  const frame = useRef<number | null>(null)

  const flush = useCallback(() => {
    frame.current = null
    const batch = queue.current.splice(0)
    if (batch.length) setRun((r) => batch.reduce(applyEvent, r))
  }, [])

  const close = useCallback(() => { source.current?.close(); source.current = null }, [])

  const attach = useCallback((id: string) => {
    close()
    jobId.current = id
    setRun(emptyRun()); queue.current = []
    const es = new EventSource(`${ASSISTANT_BASE}/ingest/${id}/events`)
    source.current = es
    es.onopen = () => setLost(false)
    // The browser reconnects by itself (with Last-Event-ID, so nothing repeats); the card only says the link dropped.
    es.onerror = () => setLost(true)
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as IngestEvent
      queue.current.push(e)
      if (frame.current === null) frame.current = requestAnimationFrame(flush)
      if (e.type === 'done') {
        close(); setPhase('done')
        void queryClient.invalidateQueries() // the new project, its contracts, documents and chunks are now in the data file
      } else if (e.type === 'error') {
        close(); setPhase(e.cancelled ? 'cancelled' : 'failed')
      }
    }
    setPhase('running')
  }, [close, flush, queryClient])

  const start = useCallback(async (id: string, opts: { fresh?: boolean } = {}) => {
    setProblem(null); setPhase('starting')
    try {
      const res = await fetch(`${ASSISTANT_BASE}/ingest/start`, { method: 'POST', body: JSON.stringify({ projectId: id, fresh: opts.fresh === true }) })
      const body = await res.json().catch(() => ({})) as { jobId?: string; error?: string }
      if (!res.ok || !body.jobId) { setPhase('failed'); setProblem(body.error ?? `The assistant server answered ${res.status}.`); return }
      started.set(id, body.jobId)
      attach(body.jobId)
    } catch {
      setPhase('failed')
      setProblem('The assistant server could not be reached. Live ingestion runs on the local assistant server (pnpm assistant); the hosted demo only shows stored projects.')
    }
  }, [attach])

  const cancel = useCallback(async () => {
    if (jobId.current) await fetch(`${ASSISTANT_BASE}/ingest/${jobId.current}/cancel`, { method: 'POST' }).catch(() => undefined)
  }, [])

  // A card drawn again for a project already started in this tab follows the same job.
  useEffect(() => {
    const id = projectId ? started.get(projectId) : undefined
    if (id && phase === 'idle') attach(id)
  }, [projectId, phase, attach])
  useEffect(() => () => { close(); if (frame.current !== null) cancelAnimationFrame(frame.current) }, [close])

  return { run, phase, problem, lost, start, cancel }
}
