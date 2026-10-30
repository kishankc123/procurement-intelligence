import { describe, expect, it } from 'vitest'
import { carryOver, type Snapshot } from './merge'

const snap = (collections: Record<string, Record<string, unknown>[]>, sources: { name: string }[]): Snapshot => ({ manifest: { project_id: 'P1', counts: {}, sources }, collections })

describe('carryOver', () => {
  it('keeps earlier plan packages and tender notices when the new run found none, with one source entry each', () => {
    const fresh = snap({ projects: [] }, [{ name: 'Procurement Notices API' }, { name: 'Projects API' }])
    const old = snap({ plan_packages: [{ id: 'PP1' }], tender_notices: [{ id: 'T1' }] }, [{ name: 'Procurement Notices API' }, { name: 'Procurement Plan document 1 (2020-01-01)' }])
    old.manifest.counts = { plan_packages: 1, tender_notices: 1 }
    carryOver(fresh, old)
    expect(fresh.collections.plan_packages).toEqual([{ id: 'PP1' }])
    expect(fresh.collections.tender_notices).toEqual([{ id: 'T1' }])
    expect((fresh.manifest.sources as { name: string }[]).map((s) => s.name).sort()).toEqual(['Procurement Notices API', 'Procurement Plan document 1 (2020-01-01)', 'Projects API'])
  })
  it('leaves rows the new run found alone', () => {
    const fresh = snap({ tender_notices: [{ id: 'NEW' }] }, [{ name: 'Procurement Notices API' }])
    carryOver(fresh, snap({ tender_notices: [{ id: 'OLD' }] }, [{ name: 'Procurement Notices API' }]))
    expect(fresh.collections.tender_notices).toEqual([{ id: 'NEW' }])
  })
})
