import { describe, expect, it } from 'vitest'
import { applyEvent, emptyRun, INGEST_STAGES, type IngestEvent } from './ingestEvents'

describe('applyEvent', () => {
  it('folds a run into the card state: stage status, counters, items, log and the final summary', () => {
    const evs: IngestEvent[] = [
      { type: 'job', jobId: 'j1', projectId: 'P123456', startedAt: 'now' },
      { type: 'stage', stage: 'contracts', status: 'running' },
      { type: 'progress', stage: 'contracts', done: 2, total: 10, found: 3 },
      { type: 'item', stage: 'chunk', id: 'DOC-1', label: 'Doc', count: 4 },
      { type: 'log', text: 'hello' },
      { type: 'stage', stage: 'contracts', status: 'done', detail: '3 contract awards' },
    ]
    const v = evs.reduce(applyEvent, emptyRun())
    expect(v).toMatchObject({ jobId: 'j1', projectId: 'P123456', log: ['hello'] })
    expect(v.stages.contracts).toMatchObject({ status: 'done', detail: '3 contract awards', done: 2, total: 10, found: 3 })
    expect(v.stages.find.status).toBe('pending')
    expect(v.items).toHaveLength(1)
  })
  it('marks the stage that failed and keeps the message', () => {
    const v = applyEvent(emptyRun(), { type: 'error', stage: 'texts', message: 'boom' })
    expect(v.stages.texts).toMatchObject({ status: 'failed', detail: 'boom' })
    expect(v.error).toEqual({ stage: 'texts', message: 'boom', cancelled: undefined })
  })
  it('keeps the item list and the log bounded', () => {
    let v = emptyRun()
    for (let i = 0; i < 500; i++) v = applyEvent(applyEvent(v, { type: 'item', stage: 'chunk', id: String(i), label: 'x' }), { type: 'log', text: String(i) })
    expect(v.items).toHaveLength(400)
    expect(v.log).toHaveLength(60)
    expect(v.items.at(-1)!.id).toBe('499')
  })
  it('lists nine stages', () => { expect(INGEST_STAGES).toHaveLength(9) })
})
