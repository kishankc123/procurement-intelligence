import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './store'

describe('the project the conversation is about', () => {
  beforeEach(() => useUiStore.setState({ chatProjectId: null, referenceKeyword: null }))

  it('starts with no project, even though the filter always has one', () => {
    expect(useUiStore.getState().chatProjectId).toBeNull()
    expect(useUiStore.getState().projectId).toBeTruthy()
  })

  it('is set when a project is shown or named, and cleared for the user\'s own procurement', () => {
    useUiStore.getState().setChatProject('P158504')
    expect(useUiStore.getState().chatProjectId).toBe('P158504')
    useUiStore.getState().setChatProject(null)
    expect(useUiStore.getState().chatProjectId).toBeNull()
  })

  it('remembers what the user\'s own procurement is modelled on, apart from the project in context', () => {
    expect(useUiStore.getState().referenceKeyword).toBeNull()
    useUiStore.getState().setReferenceKeyword('Cambodia')
    useUiStore.getState().setChatProject(null)
    expect(useUiStore.getState().referenceKeyword).toBe('Cambodia')
  })

  it('is separate from the filter project, so picking one in the filter does not change what the chat is about', () => {
    useUiStore.getState().setChatProject('P158504')
    useUiStore.getState().setProject('P-MOCK-001')
    expect(useUiStore.getState().chatProjectId).toBe('P158504')
  })
})
