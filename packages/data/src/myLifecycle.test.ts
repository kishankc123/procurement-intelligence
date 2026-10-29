import { beforeEach, describe, expect, it } from 'vitest'
import { LEARNING_OPTIONS, MONITORING_OPTIONS } from './lifecycleOptions'
import { describeLifecycle, lifecycleStatus, useMyLifecycle, type NewLifecycleItem } from './myLifecycle'

const item = (key: string, stage: NewLifecycleItem['stage'], title = key): NewLifecycleItem => ({ key, stage, kind: 'plan', title, summary: `${title} summary`, basis: 'n=3 plans, mock', detail: { a: 1 } })

describe('my lifecycle', () => {
  beforeEach(() => { sessionStorage.clear(); useMyLifecycle.getState().clear() })

  it('adds suggestions as derived items with an id and a time, and keeps their basis', () => {
    useMyLifecycle.getState().add(item('plan:1', 'planning', 'Road plan'))
    const [added] = useMyLifecycle.getState().items
    expect(added).toMatchObject({ key: 'plan:1', stage: 'planning', provenance: 'derived', basis: 'n=3 plans, mock' })
    expect(added!.id).toMatch(/^LC-/)
    expect(Number.isNaN(Date.parse(added!.addedAt))).toBe(false)
  })

  it('replaces an item added twice instead of duplicating it, and removes by id', () => {
    const { add, remove } = useMyLifecycle.getState()
    add(item('plan:1', 'planning', 'First'))
    add(item('plan:1', 'planning', 'Second'))
    expect(useMyLifecycle.getState().items.map((i) => i.title)).toEqual(['Second'])
    remove(useMyLifecycle.getState().items[0]!.id)
    expect(useMyLifecycle.getState().items).toEqual([])
  })

  it('is saved in the session storage of the tab', () => {
    useMyLifecycle.getState().add(item('tender:1', 'tender-design'))
    useMyLifecycle.getState().rename('Rural road, 2027')
    const saved = JSON.parse(sessionStorage.getItem('pi.myLifecycle')!)
    expect(saved.name).toBe('Rural road, 2027')
    expect(saved.items).toHaveLength(1)
  })

  it('says which stages are still empty, and when the lifecycle is complete', () => {
    const { add } = useMyLifecycle.getState()
    add(item('plan:1', 'planning')); add(item('tender:1', 'tender-design'))
    expect(lifecycleStatus(useMyLifecycle.getState().items).missing).toEqual(['monitoring', 'learning'])
    add(item('m:1', 'monitoring')); add(item('l:1', 'learning'))
    expect(lifecycleStatus(useMyLifecycle.getState().items).complete).toBe(true)
  })

  it('describes itself for the model with the empty stages named', () => {
    useMyLifecycle.getState().add(item('plan:1', 'planning', 'Road plan'))
    const d = describeLifecycle('Mine', useMyLifecycle.getState().items)
    expect(d.stagesStillEmpty).toEqual(['tender-design', 'monitoring', 'learning'])
    expect(d.items).toEqual([{ stage: 'planning', kind: 'plan', title: 'Road plan', summary: 'Road plan summary', status: 'suggested' }])
  })

  it('lets the user edit a suggestion, which makes it theirs, and save it as final', () => {
    const { add, update, setFinal } = useMyLifecycle.getState()
    add(item('plan:1', 'planning', 'Road plan'))
    const id = useMyLifecycle.getState().items[0]!.id
    expect(useMyLifecycle.getState().items[0]).toMatchObject({ edited: false, final: false, provenance: 'derived' })
    update(id, { detail: { a: 2 }, summary: 'changed' })
    expect(useMyLifecycle.getState().items[0]).toMatchObject({ edited: true, provenance: 'entered', summary: 'changed', detail: { a: 2 }, basis: 'n=3 plans, mock' })
    setFinal(id, true)
    update(id, { detail: { a: 3 }, summary: 'ignored' })
    expect(useMyLifecycle.getState().items[0]).toMatchObject({ final: true, summary: 'changed' })
    expect(describeLifecycle('Mine', useMyLifecycle.getState().items).items[0]!.status).toBe('final')
    setFinal(id, false)
    update(id, { detail: { a: 3 }, summary: 'again' })
    expect(useMyLifecycle.getState().items[0]).toMatchObject({ final: false, summary: 'again' })
  })

  it('offers the monitoring and learning features the app already has', () => {
    expect(MONITORING_OPTIONS.map((o) => o.id)).toEqual(['disbursement-chart', 'project-schedule', 'early-warning'])
    expect(LEARNING_OPTIONS.map((o) => o.id)).toEqual(['feedback-queue', 'learning-figures'])
  })
})
