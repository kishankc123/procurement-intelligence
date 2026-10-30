// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findProjects } from './discover'

const api = (projects: Record<string, unknown>) => ({ urls: [] as string[], async getJson(url: string) { this.urls.push(url); return { projects } } })

describe('findProjects', () => {
  it('searches by name and shapes the candidates, whatever form the API gives country and sector in', async () => {
    const io = api({
      P158504: { id: 'P158504', project_name: 'Lao  Road Sector Project 2', countryname: ['Lao People\'s Democratic Republic'], status: 'Closed', boardapprovaldate: '2016-12-13T00:00:00Z', mjsector: [{ Name: 'Transportation' }] },
      P111111: { id: 'P111111', project_name: 'Other', countryname: 'Peru', status: 'Active', sector1: { Name: 'Roads' } },
      bad: { id: 'not-an-id', project_name: 'Ignored' },
    })
    const found = await findProjects('lao road', io)
    expect(io.urls[0]).toContain('qterm=lao%20road')
    expect(found).toEqual([
      { project_id: 'P158504', project_name: 'Lao Road Sector Project 2', country: "Lao People's Democratic Republic", status: 'Closed', approval_date: '2016-12-13', sector: 'Transportation' },
      { project_id: 'P111111', project_name: 'Other', country: 'Peru', status: 'Active', approval_date: null, sector: 'Roads' },
    ])
  })
  it('looks a project id up directly, in any letter case', async () => {
    const io = api({})
    await findProjects('p158504', io)
    expect(io.urls[0]).toContain('&id=P158504')
    expect(io.urls[0]).not.toContain('qterm')
  })
  it('does not call the API for a query that is too short, and escapes what it sends', async () => {
    const io = api({})
    expect(await findProjects(' a ', io)).toEqual([])
    expect(io.urls).toEqual([])
    await findProjects('roads & bridges?x=1', io)
    expect(io.urls[0]).toContain('qterm=roads%20%26%20bridges%3Fx%3D1')
  })
})
