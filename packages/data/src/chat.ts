import { useCallback } from 'react'
import { askAssistant } from './assistantClient'
import { useUiStore } from './store'

let counter = 0
const nextId = () => `chat-${Date.now()}-${++counter}`

/** The landing-page chat: the messages, whether a reply is on its way, and send(). The conversation lives in the shared store. */
export function useAssistantChat() {
  const chat = useUiStore((s) => s.chat)
  const pending = useUiStore((s) => s.chatPending)
  const finish = useUiStore((s) => s.finishChat)

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    const { addChat, setChatPending, chatPending, chat: before } = useUiStore.getState()
    if (!message || chatPending) return
    const history = before.flatMap((e) => (e.role === 'error' ? [] : [{ role: e.role, text: e.text }])).slice(-20)
    // The project the conversation is already about: the latest reply that named one.
    const projectId = [...before].reverse().find((e) => e.reply?.projectId)?.reply?.projectId ?? undefined
    addChat({ id: nextId(), role: 'user', text: message })
    setChatPending(true)
    try {
      const reply = await askAssistant({ message, history, projectId })
      addChat({ id: nextId(), role: 'assistant', text: reply.reply, reply, animate: true })
    } catch (e) {
      addChat({ id: nextId(), role: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally {
      setChatPending(false)
    }
  }, [])

  return { chat, pending, send, finish }
}
