// Live ingestion on Vercel: GET /api/ingest/config, POST /api/ingest/start, POST /api/ingest/step. Stateless: everything a run needs between requests is
// in the Blob store, and the browser asks for the next step until the answer is "done". The logic is api/_lib/ingest.mjs, generated from ingest/hosted.ts
// (pnpm build:chat). Access needs INGEST_TOKEN in the Vercel project settings; see docs/HOSTING.md.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { getHosted } = await import('../_lib/ingest.mjs')
    const url = new URL(req.url ?? '/', 'http://localhost')
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
    const out = await getHosted(process.env).handle({ method: req.method ?? 'GET', path: url.pathname.replace(/^\/api\/ingest\/?/, ''), headers: req.headers, body })
    res.statusCode = out.status
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(out.body))
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : 'unknown error'
    console.error('api/ingest failed', e)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'The ingest function failed.', detail }))
  }
}
