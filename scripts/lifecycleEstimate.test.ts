// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withDefaults, type AssistantDb } from '../packages/data/src/assistant'
import { estimateLifecycle, THIN_SAMPLE_BELOW } from '../packages/data/src/lifecycleEstimate'
import { projectScope } from '../packages/data/src/scope'

const db = withDefaults(JSON.parse(readFileSync(new URL('../mock/db.json', import.meta.url), 'utf8')) as Partial<AssistantDb>)
const group = (r: ReturnType<typeof estimateLifecycle>, scope: 'real' | 'mock') => r.groups.find((g) => g.scope === scope)!

describe('estimating a lifecycle for a new procurement', () => {
  const r = estimateLifecycle(db, 'road')

  it('keeps real and mock apart: each group only rests on projects of its own kind', () => {
    for (const g of r.groups) for (const id of g.projects) expect(projectScope(id)).toBe(g.scope)
    expect(group(r, 'real').label).toContain('Real')
    expect(group(r, 'mock').label).toContain('illustrative')
  })

  it('gives real medians where real data holds the figure, each with how many it rests on', () => {
    const real = group(r, 'real')
    const eff = real.rows.find((x) => x.metric === 'Approval to effectiveness')!
    expect(eff.value).toBeGreaterThan(0)
    expect(eff.n).toBe(real.projects.length)
    expect(real.rows.find((x) => x.metric.startsWith('Typical Works'))!.counts).toBe('contracts')
  })

  it('gives a real bidding period from the published tender notices', () => {
    const real = group(r, 'real')
    const bidding = real.rows.find((x) => x.metric.startsWith('Bidding period'))!
    expect(bidding.counts).toBe('tender notices')
    expect(bidding.value).toBeGreaterThanOrEqual(3)
    expect(bidding.n).toBeGreaterThan(10)
  })

  it('says what the real data cannot hold instead of filling it in', () => {
    const real = group(r, 'real')
    const bid = real.rows.find((x) => x.metric === 'Evaluation and signing periods')!
    expect(bid.value).toBeNull()
    expect(bid.missing).toContain('No bid-opening')
    expect(real.rows.find((x) => x.stage === 'tender-design')!.value).toBeNull()
  })

  it('takes bidding periods and tender clauses from the mock group, flagged thin when the sample is small', () => {
    const mock = group(r, 'mock')
    expect(mock.rows.find((x) => x.metric.startsWith('Bidding period'))!.value).toBeGreaterThan(0)
    const validity = mock.rows.find((x) => x.metric === 'Bid validity')!
    expect(validity.value).toBeGreaterThan(0)
    expect(validity.thin).toBe(validity.n < THIN_SAMPLE_BELOW)
  })

  it('does not need a matching project: an unmatched sector uses all projects of the kind and says so', () => {
    const odd = estimateLifecycle(db, 'submarine cables')
    for (const g of odd.groups) {
      expect(g.projects.length).toBeGreaterThan(0)
      expect(g.note).toContain('submarine cables')
    }
  })
})
