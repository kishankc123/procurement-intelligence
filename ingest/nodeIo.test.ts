// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeIo } from './nodeIo'
import { HttpError } from './pipeline'

afterEach(() => vi.unstubAllGlobals())
const noCache = { get: () => undefined, put: () => undefined }

describe('nodeIo downloads', () => {
  it('does not retry a refusal or a missing page, and reports the status', async () => {
    for (const status of [401, 403, 404, 410]) {
      const fetchFn = vi.fn(async () => new Response('', { status, statusText: 'No' }))
      vi.stubGlobal('fetch', fetchFn)
      const err = await nodeIo({ cache: noCache, tries: 4 }).getText('https://documents.worldbank.org/x.txt').catch((e) => e)
      expect(err, String(status)).toBeInstanceOf(HttpError)
      expect(err.status).toBe(status)
      expect(err.message).toContain('Could not read https://documents.worldbank.org/x.txt')
      expect(fetchFn).toHaveBeenCalledTimes(1)
    }
  })
  it('retries a server fault and "too many requests", then gives the final status', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn(async () => new Response('', { status: 503, statusText: 'Down' }))
    vi.stubGlobal('fetch', fetchFn)
    const p = nodeIo({ cache: noCache, tries: 3 }).getJson('https://search.worldbank.org/a').catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    const err = await p
    vi.useRealTimers()
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(err).toMatchObject({ status: 503 })
  })
  it('refuses a host that is not worldbank.org without calling the network', async () => {
    const fetchFn = vi.fn(); vi.stubGlobal('fetch', fetchFn)
    await expect(nodeIo({ cache: noCache }).getText('https://example.com/x')).rejects.toThrow('only worldbank.org')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
