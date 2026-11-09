import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearToasts, getToasts } from '../toasts'

// CopilotKit hands out a placeholder agent while it connects to the runtime and the real one afterwards. The mock lets a test do the same swap.
const chat = vi.hoisted(() => {
  const agent = (name: string) => ({ name, isRunning: false, addMessage: vi.fn(), messages: [] as unknown[] })
  return { agent, current: agent('placeholder') as ReturnType<typeof agent>, runAgent: vi.fn() }
})
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent: chat.current }),
  useCopilotKit: () => ({ copilotkit: { runAgent: chat.runAgent } }),
}))

import { IngestInChat } from './IngestInChat'

afterEach(() => { cleanup(); clearToasts(); chat.runAgent.mockClear(); chat.current = chat.agent('placeholder') })

const result = JSON.stringify({ query: 'road', candidates: [{ project_id: 'P222222', project_name: 'Stored Road', country: 'Peru', status: 'Active', approval_date: null, sector: null, stored: true }] })
const tree = () => <QueryClientProvider client={new QueryClient()}><IngestInChat result={result} /></QueryClientProvider>

describe('the buttons on the ingest card reach the chat', () => {
  it('sends the message to the agent that is current when the button is pressed, not the placeholder the chat started with', () => {
    const placeholder = chat.current
    const view = render(tree())
    const real = chat.agent('real')
    chat.current = real // the runtime finished connecting and the chat now holds the real agent
    view.rerender(tree())
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(real.addMessage).toHaveBeenCalledTimes(1)
    expect(real.addMessage.mock.calls[0]![0]).toMatchObject({ role: 'user', content: 'Show the lifecycle for Stored Road (P222222)' })
    expect(chat.runAgent).toHaveBeenCalledWith({ agent: real })
    expect(placeholder.addMessage).not.toHaveBeenCalled()
  })

  it('says so when the assistant is still answering, instead of doing nothing', () => {
    chat.current.isRunning = true
    render(tree())
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(chat.current.addMessage).not.toHaveBeenCalled()
    expect(chat.runAgent).not.toHaveBeenCalled()
    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0]).toMatchObject({ title: 'One moment', text: expect.stringContaining('still answering') })
  })

  it('starts a run for the message it added', () => {
    render(tree())
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(chat.current.addMessage).toHaveBeenCalledTimes(1)
    expect(chat.runAgent).toHaveBeenCalledTimes(1)
    expect(getToasts()).toEqual([])
  })
})
