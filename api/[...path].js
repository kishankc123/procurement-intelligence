// Mock API on Vercel: json-server over an in-memory copy of mock/db.json.
// Writes work but live only in this function instance, so they reset on a cold start or redeploy.
// Projects ingested live on the hosted site are read from the Blob store and merged into that copy (api/_lib/ingest.mjs), at most every few seconds.
const fs = require('node:fs')
const path = require('node:path')
const jsonServer = require('json-server')

const db = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mock', 'db.json'), 'utf8'))
const server = jsonServer.create()
server.use(jsonServer.defaults({ logger: false, noGzip: true }))
server.use('/api', jsonServer.router(db))

module.exports = async function handler(req, res) {
  // Without a connected Blob store (BLOB_READ_WRITE_TOKEN) there is nothing to merge, and the import is skipped.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try { await (await import('./_lib/ingest.mjs')).dbWithIngested(db) } catch (e) { console.error('Could not merge ingested projects', e) }
  }
  return server(req, res)
}
