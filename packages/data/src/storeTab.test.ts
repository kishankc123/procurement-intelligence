import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { sessionStorage.clear(); vi.resetModules() })

describe('the conversation lasts for the tab', () => {
  it('is saved as it changes and read back by a fresh load of the store', async () => {
    const a = await import('./store')
    a.useUiStore.getState().addChat({ id: '1', role: 'user', text: 'hi' })
    a.useUiStore.getState().addChat({ id: '2', role: 'assistant', text: 'hello', animate: true })
    a.useUiStore.getState().setChatProject('P1')
    vi.resetModules()
    const b = await import('./store')
    const s = b.useUiStore.getState()
    expect(s.chat.map((e) => e.id)).toEqual(['1', '2'])
    expect(s.chat[1]?.animate).toBe(false) // an old reply is not played again
    expect(s.chatProjectId).toBe('P1')
    expect(s.chatPending).toBe(false)
  })
  it('starts empty when nothing was saved or the saved text is damaged', async () => {
    sessionStorage.setItem('pi.tab.v1', 'oops')
    const { useUiStore } = await import('./store')
    expect(useUiStore.getState().chat).toEqual([])
  })
})
