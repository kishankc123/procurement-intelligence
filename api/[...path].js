// Mock API on Vercel: json-server over an in-memory copy of mock/db.json.
// Writes work but live only in this function instance, so they reset on a cold start or redeploy.
const fs = require('node:fs')
const path = require('node:path')
const jsonServer = require('json-server')

const db = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mock', 'db.json'), 'utf8'))
const server = jsonServer.create()
server.use(jsonServer.defaults({ logger: false, noGzip: true }))
server.use('/api', jsonServer.router(db))

module.exports = server
