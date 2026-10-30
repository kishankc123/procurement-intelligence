// The real network, cache and embedding model behind the pipeline. Only this file touches the outside world.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { Embedder, PipelineIo } from './pipeline'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CACHE_DIR = join(ROOT, 'ingest', 'cache')

/** The only hosts the server will fetch from. A project id or a document link from an API response can never send it elsewhere. */
export const isAllowedUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && (u.hostname === 'worldbank.org' || u.hostname.endsWith('.worldbank.org'))
  } catch { return false }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetries<T>(url: string, read: (res: Response) => Promise<T>, tries = 4, timeoutMs = 60_000): Promise<T> {
  if (!isAllowedUrl(url)) throw new Error(`Refused to fetch ${url.slice(0, 80)}: only worldbank.org over https is allowed`)
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return await read(res)
    } catch (e) {
      if (i >= tries) throw new Error(`Could not read ${url.slice(0, 90)}: ${e instanceof Error ? e.message : e}`)
      await sleep(1500 * i)
    }
  }
}

/** Cache files are gzipped JSON. A plain `<key>.json` written by the older script is still read. */
export function fileCache(dir = CACHE_DIR, fresh = false): PipelineIo['cache'] {
  return {
    get<T>(key: string): T | undefined {
      if (fresh) return undefined
      const gz = join(dir, `${key}.json.gz`), plain = join(dir, `${key}.json`)
      if (existsSync(gz)) return JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8')) as T
      if (existsSync(plain)) return JSON.parse(readFileSync(plain, 'utf8')) as T
      return undefined
    },
    put(key: string, value: unknown) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${key}.json.gz`), gzipSync(JSON.stringify(value)))
    },
  }
}

/** `cache` replaces the file cache (the hosted version uses the store); `tries` and `timeoutMs` shorten the waits where a request has a time limit. */
export function nodeIo(opts: { fresh?: boolean; cacheDir?: string; cache?: PipelineIo['cache']; tries?: number; timeoutMs?: number } = {}): PipelineIo {
  return {
    getJson: (url) => withRetries(url, (r) => r.json(), opts.tries, opts.timeoutMs),
    getText: (url) => withRetries(url.replace('http://', 'https://'), (r) => r.text(), opts.tries, opts.timeoutMs),
    cache: opts.cache ?? fileCache(opts.cacheDir, opts.fresh),
  }
}

export const EMBED_MODEL = 'text-embedding-3-small'
export const EMBED_DIMENSIONS = 512
const OPENAI_URL = 'https://api.openai.com/v1/embeddings'

/** The OpenAI embedding model, or null (with the reason) when there is no key. The key stays on the server. */
export function openAiEmbedder(env: Record<string, string | undefined> = process.env): { embedder: Embedder | null; reason?: string } {
  const key = env.OPENAI_API_KEY
  if (!key) return { embedder: null, reason: 'OPENAI_API_KEY is not set (put it in .env.local), so the chunks were not embedded' }
  return {
    embedder: {
      model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS, usdPer1MTokens: 0.02,
      async embed(texts) { return embedWith(key, texts) },
    },
  }
}

/** One embeddings request. Also used for the question at search time. */
export async function embedWith(key: string, texts: string[], tries = 3): Promise<{ vectors: number[][]; tokens: number }> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMENSIONS, encoding_format: 'float' }),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.status === 429 || res.status >= 500) throw new Error(`${res.status} ${res.statusText}`)
      if (!res.ok) throw new Error(`The embedding request was refused (${res.status}): ${(await res.text()).slice(0, 200)}`)
      const body = (await res.json()) as { data: { index: number; embedding: number[] }[]; usage?: { total_tokens?: number } }
      return { vectors: [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: body.usage?.total_tokens ?? 0 }
    } catch (e) {
      if (i >= tries || (e instanceof Error && e.message.startsWith('The embedding request was refused'))) throw e
      await sleep(1000 * i)
    }
  }
}
