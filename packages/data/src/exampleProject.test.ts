import { describe, expect, it } from 'vitest'
import type { Project } from './schemas'
import { pickExampleProject } from './exampleProject'

const project = (id: string) => ({ project_id: id, project_name: id }) as Project
const reports = (id: string, n: number) => Array.from({ length: n }, () => ({ project_id: id }))

describe('the example project', () => {
  const projects = [project('P-MOCK-001'), project('P1'), project('P2')]

  it('is the real project with the most supervision reports', () => {
    expect(pickExampleProject(projects, [...reports('P1', 3), ...reports('P2', 9), ...reports('P-MOCK-001', 20)])?.project_id).toBe('P2')
  })

  it('never takes a mock project while a real one has reports, and breaks a tie by id', () => {
    expect(pickExampleProject(projects, [...reports('P-MOCK-001', 5), ...reports('P1', 1)])?.project_id).toBe('P1')
    expect(pickExampleProject(projects, [...reports('P2', 2), ...reports('P1', 2)])?.project_id).toBe('P1')
  })

  it('uses a mock project only when no real project has reports, and is null when none has', () => {
    expect(pickExampleProject(projects, reports('P-MOCK-001', 2))?.project_id).toBe('P-MOCK-001')
    expect(pickExampleProject(projects, [])).toBeNull()
  })
})
