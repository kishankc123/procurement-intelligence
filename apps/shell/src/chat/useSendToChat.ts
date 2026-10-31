import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2'
import { scrollChatToLatest } from './chatScroll'
import { notify } from '../toasts'

/**
 * What a click inside a card does: it says the same thing in the chat, as if the user had typed it, and the model answers.
 *
 * Call this inside the component that draws the card, never once in a registration that is kept. While the chat is still connecting to the runtime,
 * `useAgent` hands out a placeholder agent and swaps in the real one when it is ready; a copy taken early belongs to the placeholder, and a message
 * added to it never appears. Asking on every render always gives the current agent.
 */
export function useSendToChat() {
  const { agent } = useAgent()
  const { copilotkit } = useCopilotKit()
  return (text: string) => {
    // One answer at a time. Say so, instead of a click that seems to do nothing.
    if (agent.isRunning) {
      notify({ tone: 'error', title: 'One moment', text: 'I am still answering. Try again when the reply has finished.' })
      return
    }
    agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text })
    void copilotkit.runAgent({ agent })
    // A click in an earlier card (a donut, a button) adds the message far above the end of the list; bring the view to it.
    scrollChatToLatest()
  }
}
