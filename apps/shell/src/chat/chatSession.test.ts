import { beforeEach, describe, expect, it } from 'vitest'
import { clearChat, loadChat, saveChat } from './chatSession'

beforeEach(() => sessionStorage.clear())

describe('chatSession', () => {
  it('brings back what was saved, in order', () => {
    saveChat([{ id: '1', role: 'user', content: 'hi' }, { id: '2', role: 'assistant', content: 'hello' }])
    expect(loadChat().map((m) => m.id)).toEqual(['1', '2'])
  })
  it('is empty when nothing was saved, or the saved text is damaged', () => {
    expect(loadChat()).toEqual([])
    sessionStorage.setItem('procureintel.chat.v1', '{not json')
    expect(loadChat()).toEqual([])
    sessionStorage.setItem('procureintel.chat.v1', '[1,{"id":"a","role":"user"}]')
    expect(loadChat()).toHaveLength(1)
  })
  it('clears', () => { saveChat([{ id: '1', role: 'user' }]); clearChat(); expect(loadChat()).toEqual([]) })
  it('drops the oldest turns when too long, and starts again at a user message', () => {
    const big = 'x'.repeat(600_000)
    saveChat([
      { id: 'u1', role: 'user', content: big }, { id: 'a1', role: 'assistant', content: big },
      { id: 't1', role: 'tool', content: big }, { id: 'u2', role: 'user', content: 'last' },
    ])
    const got = loadChat()
    expect(got[0]?.role).toBe('user')
    expect(got.at(-1)?.id).toBe('u2')
  })
  it('does not throw when storage is blocked', () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('blocked') }
    try { expect(() => saveChat([{ id: '1', role: 'user' }])).not.toThrow() } finally { Storage.prototype.setItem = real }
  })
})
