import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ASSISTANT_BASE } from '@pi/config'
import { applyEvent, emptyRun, type IngestEvent, type RunView } from '@pi/data'
import { driveSteps, fetchConfig, readToken, saveToken } from './ingestClient'

export type RunPhase = 'idle' | 'starting' | 'running' | 'done' | 'failed' | 'cancelled'

/** Jobs this tab started on the local server, by project, so a card that is drawn again (the chat list re-mounting) follows the same run instead of starting another. */
const started = new Map<string, string>()

/**
 * Runs an ingestion and follows it. Which way depends on the server (its /ingest/config says so):
 *  - local server: it runs the job and streams the events (server-sent events); a card that attaches late replays the run;
 *  - hosted: the browser asks for the next step until the server says it is done (see ingestClient.ts), and the ingest token is asked for first.
 * Events are applied at most once per animation frame: a cached run emits hundreds of progress events a second and the page only needs the latest.
 */
export function useIngestRun(projectId: string | null) {
  const queryClient = useQueryClient()
  const [run, setRun] = useState<RunView>(emptyRun)
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const [lost, setLost] = useState(false)
  const [needsToken, setNeedsToken] = useState(false)
  const source = useRef<EventSource | null>(null)
  const jobId = useRef<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const queue = useRef<IngestEvent[]>([])
  const frame = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    frame.current = null
    const batch = queue.current.splice(0)
    if (batch.length) setRun((r) => batch.reduce(applyEvent, r))
  }, [])

  const close = useCallback(() => { source.current?.close(); source.current = null }, [])

  const handle = useCallback((e: IngestEvent) => {
    queue.current.push(e)
    if (frame.current === null) frame.current = requestAnimationFrame(flush)
    if (e.type === 'done') {
      setPhase('done')
      void queryClient.invalidateQueries() // the new project, its contracts, documents and chunks are now in the data
      // On the hosted site another instance of the data function may not have looked at the store yet; look again a little later.
      timer.current = setTimeout(() => void queryClient.invalidateQueries(), 6000)
    } else if (e.type === 'error') setPhase(e.cancelled ? 'cancelled' : 'failed')
  }, [flush, queryClient])

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
      handle(e)
      if (e.type === 'done' || e.type === 'error') close()
    }
    setPhase('running')
  }, [close, handle])

  const startStream = useCallback(async (id: string, fresh: boolean) => {
    try {
      const res = await fetch(`${ASSISTANT_BASE}/ingest/start`, { method: 'POST', body: JSON.stringify({ projectId: id, fresh }) })
      const body = await res.json().catch(() => ({})) as { jobId?: string; error?: string }
      if (!res.ok || !body.jobId) { setPhase('failed'); setProblem(body.error ?? `The assistant server answered ${res.status}.`); return }
      started.set(id, body.jobId)
      attach(body.jobId)
    } catch {
      setPhase('failed')
      setProblem('The assistant server could not be reached. Start it with pnpm assistant, or use a deployment where live ingestion is switched on.')
    }
  }, [attach])

  const startSteps = useCallback(async (id: string) => {
    const token = readToken()
    if (!token) { setPhase('idle'); setNeedsToken(true); setProblem('Enter the ingest token to run an ingestion on this site.'); return }
    const ctl = new AbortController()
    abort.current = ctl
    setRun(emptyRun()); queue.current = []
    setPhase('running')
    const outcome = await driveSteps({ base: ASSISTANT_BASE, projectId: id, token, signal: ctl.signal, onEvents: (events) => events.forEach(handle) })
    if (outcome.ok) return // done or failed: the events already set the phase
    setPhase(outcome.cancelled ? 'cancelled' : 'failed')
    setProblem(outcome.message)
    if (outcome.needsToken) { saveToken(''); setNeedsToken(true) }
  }, [handle])

  const start = useCallback(async (id: string, opts: { fresh?: boolean } = {}) => {
    setProblem(null); setNeedsToken(false); setPhase('starting')
    const config = await fetchConfig(ASSISTANT_BASE)
    if (config?.mode === 'steps') {
      if (config.enabled === false) { setPhase('failed'); setProblem(config.reason ?? 'Live ingestion is not switched on for this site.'); return }
      return startSteps(id)
    }
    return startStream(id, opts.fresh === true)
  }, [startSteps, startStream])

  /** Saves the token the user typed and starts the run that was waiting for it. */
  const submitToken = useCallback((token: string, id: string) => { saveToken(token.trim()); return start(id) }, [start])

  const cancel = useCallback(async () => {
    abort.current?.abort()
    if (jobId.current) await fetch(`${ASSISTANT_BASE}/ingest/${jobId.current}/cancel`, { method: 'POST' }).catch(() => undefined)
  }, [])

  // A card drawn again for a project already started in this tab on the local server follows the same job.
  useEffect(() => {
    const id = projectId ? started.get(projectId) : undefined
    if (id && phase === 'idle' && !needsToken) attach(id)
  }, [projectId, phase, needsToken, attach])
  useEffect(() => () => {
    close(); abort.current?.abort()
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (timer.current) clearTimeout(timer.current)
  }, [close])

  return { run, phase, problem, lost, needsToken, start, submitToken, cancel }
}
