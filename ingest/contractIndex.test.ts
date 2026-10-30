// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildContractIndex, contractSourceFromStore, readIndexMeta, shardOf } from './contractIndex'
import { fixtureIo, FIXTURE_ID, CONTRACT_PAGES } from './fixtures'
import { memoryStore } from './store'

const NOW = () => new Date('2026-03-04T05:06:07Z')

describe('contract index', () => {
  it('groups every page of the list by project into shards, with a meta record', async () => {
    const store = memoryStore(); const io = fixtureIo()
    const progress: number[] = []
    const meta = await buildContractIndex({ io, store, now: NOW, onProgress: (d) => progress.push(d) })
    expect(meta).toMatchObject({ built_at: '2026-03-04T05:06:07.000Z', records: 5, projects: 3, pages: 3 })
    expect(progress.at(-1)).toBe(3)
    // P999001 and P000001 share shard 01 (same last two digits); P000002 is in 02.
    expect(shardOf(FIXTURE_ID)).toBe('01')
    expect([...store.data.keys()].sort()).toEqual(['contracts-index/01.json.gz', 'contracts-index/02.json.gz', 'contracts-index/meta.json'])
    expect(await readIndexMeta(store)).toEqual(meta)
  })

  it('gives a project its rows in page order, from one shard read', async () => {
    const store = memoryStore(); await buildContractIndex({ io: fixtureIo(), store, now: NOW })
    const source = contractSourceFromStore(store)
    const got = await source.forProject(FIXTURE_ID)
    expect(got!.builtAt).toBe('2026-03-04T05:06:07.000Z')
    expect(got!.rows.map((r) => r.borrower_contract_reference_number)).toEqual([`REF-${FIXTURE_ID}-1`, `REF-${FIXTURE_ID}-3`, `REF-${FIXTURE_ID}-5`])
    expect(got!.rows).toEqual([CONTRACT_PAGES[0]!.data[0], CONTRACT_PAGES[0]!.data[2], CONTRACT_PAGES[2]!.data[0]])
  })

  it('answers with no rows for a project that has no awards, and null when there is no index at all', async () => {
    const store = memoryStore()
    expect(await contractSourceFromStore(store).forProject(FIXTURE_ID)).toBeNull()
    await buildContractIndex({ io: fixtureIo(), store, now: NOW })
    const source = contractSourceFromStore(store)
    expect((await source.forProject('P555599'))!.rows).toEqual([])
  })

  it('reuses cached pages and ignores rows with a malformed project id', async () => {
    const io = fixtureIo(); const store = memoryStore()
    await buildContractIndex({ io, store, now: NOW })
    const calls = io.calls.length
    await buildContractIndex({ io, store, now: NOW })
    expect(io.calls.length).toBe(calls)
    const bad = { ...io, getJson: async () => ({ count: 1, data: [{ ...CONTRACT_PAGES[0]!.data[0]!, project_id: '../etc' }] }), cache: undefined }
    const s2 = memoryStore()
    expect((await buildContractIndex({ io: bad, store: s2, now: NOW })).records).toBe(0)
  })
})
