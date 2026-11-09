// What the browser needs to talk to live ingestion, apart from React: reading the server's configuration, remembering the ingest token for the tab,
// and driving a hosted run step by step. Kept free of React so it can be tested with a fake fetch.
import type { IngestEvent } from '@pi/data'

export interface IngestConfig {
  /** 'stream': the local server runs the job and streams its events. 'steps': hosted, the browser asks for the next step until done. Absent means 'stream'. */
  mode?: 'stream' | 'steps'
  enabled?: boolean
  tokenRequired?: boolean
  reason?: string
  storage?: boolean
  index?: { built_at: string; projects: number; records: number } | null
  dailyLimit?: number
  embedding: { available: boolean; model?: string; dimensions?: number; reason?: string }
}

export const TOKEN_KEY = 'pi.ingestToken'
/** The token is kept for this tab only (sessionStorage), never in a cookie or local storage, and is sent only to the ingest endpoints. */
export const readToken = (): string => { try { return sessionStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' } }
export const saveToken = (token: string): void => { try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY) } catch { /* storage blocked */ } }

export async function fetchConfig(base: string, fetchFn: typeof fetch = fetch): Promise<IngestConfig | null> {
  try {
    const res = await fetchFn(`${base}/ingest/config`)
    if (!res.ok) return null
    const body = await res.json() as Partial<IngestConfig>
    return body.embedding ? body as IngestConfig : null
  } catch { return null }
}

export type StepOutcome = { ok: true; status: 'done' | 'failed' } | { ok: false; message: string; needsToken?: boolean; cancelled?: boolean }

interface DriveOptions {
  base: string
  projectId: string
  token: string
  onEvents: (events: IngestEvent[]) => void
  signal?: AbortSignal
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** Most requests one run may use. A run that needs more has stopped making progress. */
  maxSteps?: number
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Starts a hosted run and asks for its next step until the server says it is done or failed. Each answer carries the events of that step, which are
 * handed to `onEvents` as they arrive. A step the server answers "paused" is asked again at once; "busy" (another request is already working on this
 * project) is asked again after a moment. A dropped connection is retried a few times, because the work done so far is kept in the store.
 */
export async function driveSteps(o: DriveOptions): Promise<StepOutcome> {
  const fetchFn = o.fetchFn ?? fetch
  const sleep = o.sleep ?? wait
  const headers = { 'Content-Type': 'application/json', 'X-Ingest-Token': o.token }
  const post = async (path: string): Promise<Response> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetchFn(`${o.base}/ingest/${path}`, { method: 'POST', headers, body: JSON.stringify({ projectId: o.projectId }), signal: o.signal })
        // A step is safe to repeat (what it finished is in the store), so a step that Vercel cut off (502, 503, 504) or turned away (429) is asked again.
        if (path === 'step' && (res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1500 * attempt); continue }
        return res
      } catch (e) {
        if (o.signal?.aborted) throw e
        if (attempt >= 3) throw e
        await sleep(1500 * attempt)
      }
    }
  }
  const fail = async (res: Response): Promise<StepOutcome> => {
    const body = await res.json().catch(() => ({})) as { error?: string }
    return { ok: false, message: body.error ?? `The server answered ${res.status}.`, needsToken: res.status === 401 || res.status === 403 }
  }
  try {
    const started = await post('start')
    if (!started.ok) return await fail(started)
    for (let i = 0; i < (o.maxSteps ?? 80); i++) {
      if (o.signal?.aborted) return { ok: false, message: 'Cancelled by the user', cancelled: true }
      const res = await post('step')
      if (!res.ok) return await fail(res)
      const body = await res.json() as { status: 'paused' | 'done' | 'failed' | 'busy'; events?: IngestEvent[] }
      if (body.events?.length) o.onEvents(body.events)
      if (body.status === 'done' || body.status === 'failed') return { ok: true, status: body.status }
      if (body.status === 'busy') await sleep(1500)
    }
    return { ok: false, message: 'The run used too many steps without finishing. What was read is kept, so trying again continues from there.' }
  } catch (e) {
    if (o.signal?.aborted) return { ok: false, message: 'Cancelled by the user', cancelled: true }
    return { ok: false, message: `The server could not be reached (${e instanceof Error ? e.message : 'network error'}). What was read is kept, so trying again continues from there.` }
  }
}
