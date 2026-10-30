import { describe, expect, it, vi } from 'vitest'
import type { IngestEvent } from '@pi/data'
import { driveSteps, fetchConfig, readToken, saveToken } from './ingestClient'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const ev = (text: string): IngestEvent => ({ type: 'log', text })

/** A fake server: `steps` are the answers to successive step requests. */
function server(steps: unknown[], opts: { start?: Response } = {}) {
  const calls: { path: string; token: string | null; body: unknown }[] = []
  let i = 0
  const fetchFn = (async (url: string, init: RequestInit) => {
    const path = new URL(url, 'http://x').pathname.split('/ingest/')[1]!
    calls.push({ path, token: new Headers(init.headers).get('x-ingest-token'), body: JSON.parse(String(init.body)) })
    if (path === 'start') return opts.start ?? json(200, { projectId: 'P1' })
    const next = steps[Math.min(i++, steps.length - 1)]
    if (next instanceof Error) throw next
    return next instanceof Response ? next : json(200, next)
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}
const base = (s: ReturnType<typeof server>, extra = {}) => ({ base: 'http://h/api', projectId: 'P158504', token: 'tok', fetchFn: s.fetchFn, sleep: async () => undefined, onEvents: vi.fn(), ...extra })

describe('driveSteps', () => {
  it('starts, asks for steps while paused, hands over every step\'s events and stops at done', async () => {
    const s = server([{ status: 'paused', events: [ev('a')] }, { status: 'paused', events: [ev('b')] }, { status: 'done', events: [ev('c')] }])
    const o = base(s)
    expect(await driveSteps(o)).toEqual({ ok: true, status: 'done' })
    expect(s.calls.map((c) => c.path)).toEqual(['start', 'step', 'step', 'step'])
    expect(o.onEvents.mock.calls.map((c) => (c[0] as IngestEvent[])[0])).toEqual([ev('a'), ev('b'), ev('c')])
    expect(s.calls.every((c) => c.token === 'tok' && (c.body as { projectId: string }).projectId === 'P158504')).toBe(true)
  })
  it('waits and asks again when the server is busy with the same project', async () => {
    const s = server([{ status: 'busy', events: [] }, { status: 'done', events: [] }])
    const sleep = vi.fn(async () => undefined)
    await driveSteps(base(s, { sleep }))
    expect(sleep).toHaveBeenCalledWith(1500)
  })
  it('reports a failed run as an outcome (its error event was already delivered)', async () => {
    const s = server([{ status: 'failed', events: [{ type: 'error', stage: 'texts', message: 'boom' }] }])
    expect(await driveSteps(base(s))).toEqual({ ok: true, status: 'failed' })
  })
  it('turns a refusal into a message, and flags a missing or wrong token', async () => {
    const wrong = server([], { start: json(401, { error: 'The ingest token is missing or wrong.' }) })
    expect(await driveSteps(base(wrong))).toEqual({ ok: false, message: 'The ingest token is missing or wrong.', needsToken: true })
    const limit = server([], { start: json(429, { error: 'The daily limit of 5 ingestions has been reached.' }) })
    expect(await driveSteps(base(limit))).toMatchObject({ ok: false, message: expect.stringContaining('daily limit'), needsToken: false })
    const html = server([], { start: new Response('<html>', { status: 502 }) })
    expect(await driveSteps(base(html))).toMatchObject({ ok: false, message: 'The server answered 502.' })
  })
  it('retries a dropped connection a few times, then gives up with a message that says the work is kept', async () => {
    const flaky = server([new Error('offline'), { status: 'done', events: [] }])
    expect(await driveSteps(base(flaky))).toEqual({ ok: true, status: 'done' })
    const dead = server([new Error('offline')])
    const out = await driveSteps(base(dead))
    expect(out).toMatchObject({ ok: false, message: expect.stringContaining('is kept') })
  })
  it('stops when it is cancelled, and when a run never finishes', async () => {
    const ctl = new AbortController()
    const s = server([{ status: 'paused', events: [] }])
    const o = base(s, { signal: ctl.signal, onEvents: vi.fn(), maxSteps: 5 })
    expect(await driveSteps({ ...o, maxSteps: 3 })).toMatchObject({ ok: false, message: expect.stringContaining('too many steps') })
    ctl.abort()
    expect(await driveSteps(o)).toEqual({ ok: false, message: 'Cancelled by the user', cancelled: true })
  })
})

describe('config and token', () => {
  it('reads the config, tolerating an old server and a failure', async () => {
    const ok = (async () => json(200, { embedding: { available: true, model: 'm', dimensions: 4 } })) as unknown as typeof fetch
    expect(await fetchConfig('http://h', ok)).toEqual({ embedding: { available: true, model: 'm', dimensions: 4 } })
    expect(await fetchConfig('http://h', (async () => json(200, {})) as unknown as typeof fetch)).toBeNull()
    expect(await fetchConfig('http://h', (async () => json(500, {})) as unknown as typeof fetch)).toBeNull()
    expect(await fetchConfig('http://h', (async () => { throw new Error('x') }) as unknown as typeof fetch)).toBeNull()
  })
  it('keeps the token for the tab only, and forgets it when it is cleared', () => {
    saveToken('abc'); expect(readToken()).toBe('abc'); expect(localStorage.length).toBe(0)
    saveToken(''); expect(readToken()).toBe('')
  })
})
