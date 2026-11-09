// Builds the contract index (see contractIndex.ts) from the public contract-awards list.
//   pnpm ingest:index            writes to Vercel Blob when BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID with VERCEL_OIDC_TOKEN, is set (in .env.local or the environment), otherwise to ingest/cache/store
//   pnpm ingest:index --files    always write to ingest/cache/store (the local server uses it to skip the scan)
// It reads every page of the list (the first time; pages are cached in ingest/cache), so it takes a few minutes and a few hundred MB of memory.
import { join } from 'node:path'
import { buildContractIndex } from './contractIndex'
import { CACHE_DIR, nodeIo, ROOT } from './nodeIo'
import { blobStoreFromEnv } from './hosted'
import { fileStore } from './store'

try { process.loadEnvFile(join(ROOT, '.env.local')) } catch { /* no .env.local */ }
const useFiles = process.argv.includes('--files')

async function main() {
  const blob = useFiles ? null : await blobStoreFromEnv(process.env)
  const store = blob ?? fileStore(join(CACHE_DIR, 'store'))
  console.log(`[ingest:index] writing to ${blob ? 'Vercel Blob' : `files in ${join(CACHE_DIR, 'store')}`}`)
  const meta = await buildContractIndex({
    io: nodeIo(), store,
    onProgress: (done, total) => { if (done % 20 === 0 || done === total) console.log(`[ingest:index] page ${done} of ${total}`) },
  })
  console.log(`[ingest:index] done: ${meta.records} contract rows for ${meta.projects} projects from ${meta.pages} pages`)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
