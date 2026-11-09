// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { IngestEvent } from '../packages/data/src/ingestEvents'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from './fixtures'
import { createJobRunner } from './jobs'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
const setup = (over: Parameters<typeof createJobRunner>[0] extends infer D ? Partial<D> : never = {}) => {
  const d = mkdtempSync(join(tmpdir(), 'pi-jobs-')); dirs.push(d)
  const paths = { snapshots: join(d, 'ingested'), embeddings: join(d, 'embeddings'), db: join(d, 'db.json') }
  writeFileSync(paths.db, JSON.stringify({ meta: { dataset_label: 'x' }, projects: [], contracts: [], documents: [], chunks: [], sources: [], supervision_reports: [] }))
  const io = fixtureIo()
  const runner = createJobRunner({ io: () => io, embedder: () => ({ embedder: fakeEmbedder(16) }), dirs: paths, ...over })
  return { runner, paths, io }
}
const finished = (runner: ReturnType<typeof createJobRunner>, id: string) => new Promise<IngestEvent[]>((resolve) => {
  const seen: IngestEvent[] = []
  runner.subscribe(id, 0, (e) => { seen.push(e); if (e.type === 'done' || e.type === 'error') setTimeout(() => resolve(seen), 0) })
})

describe('job runner', () => {
  it('runs a project to the end, writes the files, merges into the db and ends with done', async () => {
    const { runner, paths } = setup()
    const r = runner.start(FIXTURE_ID)
    if (!r.ok) throw new Error('should start')
    const events = await finished(runner, r.job.id)
    expect(events[0]).toMatchObject({ type: 'job', projectId: FIXTURE_ID })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(events.some((e) => e.type === 'stage' && e.stage === 'publish' && e.status === 'done')).toBe(true)
    expect(runner.get(r.job.id)!.status).toBe('done')
    expect(existsSync(join(paths.snapshots, `${FIXTURE_ID}.json`))).toBe(true)
    expect(JSON.parse(readFileSync(paths.db, 'utf8')).projects.map((p: any) => p.project_id)).toEqual([FIXTURE_ID])
  })

  it('replays the whole run to a late subscriber, and resumes from an index', async () => {
    const { runner } = setup()
    const r = runner.start(FIXTURE_ID)
    if (!r.ok) throw new Error('should start')
    const all = await finished(runner, r.job.id)
    const late: IngestEvent[] = []
    runner.subscribe(r.job.id, 0, (e) => late.push(e))
    expect(late).toEqual(all)
    const tail: number[] = []
    runner.subscribe(r.job.id, all.length - 2, (_e, i) => tail.push(i))
    expect(tail).toEqual([all.length - 2, all.length - 1])
  })

  it('allows one running job at a time, returns the same job for the same project, and rejects bad ids', async () => {
    const { runner } = setup()
    const a = runner.start(FIXTURE_ID)
    if (!a.ok) throw new Error('should start')
    const same = runner.start(FIXTURE_ID)
    expect(same).toMatchObject({ ok: true, alreadyRunning: true })
    expect(same.ok && same.job.id).toBe(a.job.id)
    expect(runner.start('P000001')).toMatchObject({ ok: false, status: 409 })
    expect(runner.start('nope')).toMatchObject({ ok: false, status: 400 })
    await finished(runner, a.job.id)
    expect(runner.running()).toBeUndefined()
  })

  it('cancels a running job: status cancelled, no files, no db change', async () => {
    const { runner, paths } = setup()
    const r = runner.start(FIXTURE_ID)
    if (!r.ok) throw new Error('should start')
    expect(runner.cancel(r.job.id)).toBe(true)
    const events = await finished(runner, r.job.id)
    expect(events.at(-1)).toMatchObject({ type: 'error', cancelled: true })
    expect(runner.get(r.job.id)!.status).toBe('cancelled')
    expect(existsSync(join(paths.snapshots, `${FIXTURE_ID}.json`))).toBe(false)
    expect(JSON.parse(readFileSync(paths.db, 'utf8')).projects).toEqual([])
    expect(runner.cancel(r.job.id)).toBe(false)
  })

  it('reports a source failure as one error event and leaves the data alone', async () => {
    const io = fixtureIo({ fail: (u) => u.includes('apiservice') })
    const { runner, paths } = setup({ io: () => io })
    const r = runner.start(FIXTURE_ID)
    if (!r.ok) throw new Error('should start')
    const events = await finished(runner, r.job.id)
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1)
    expect(runner.get(r.job.id)!.status).toBe('failed')
    expect(existsSync(join(paths.snapshots, `${FIXTURE_ID}.json`))).toBe(false)
    // and the next start works (the failed job is not "running")
    expect(runner.start(FIXTURE_ID)).toMatchObject({ ok: true })
  })

  it('finishes with embedding skipped, and says why, when there is no model', async () => {
    const { runner } = setup({ embedder: () => ({ embedder: null, reason: 'no key here' }) })
    const r = runner.start(FIXTURE_ID)
    if (!r.ok) throw new Error('should start')
    const events = await finished(runner, r.job.id)
    expect(events.find((e) => e.type === 'stage' && e.stage === 'embed')).toMatchObject({ status: 'skipped', detail: 'no key here' })
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { embedding: { status: 'skipped', reason: 'no key here' } } })
  })

  it('a failure to write the files is an error on the publish stage, and the job is failed', async () => {
    const { runner } = setup({ publish: () => { throw new Error('disk full') } })
    const r = runner.start(FIXTURE_ID)
    if (!r.ok) throw new Error('should start')
    const events = await finished(runner, r.job.id)
    expect(events.at(-1)).toMatchObject({ type: 'error', stage: 'publish' })
    expect(runner.get(r.job.id)!.status).toBe('failed')
  })
})
