import { projectScope, useAssistantChat, useProjects } from '@pi/data'
import { ChatWindow, type ChatMessageView } from '@pi/domain'
import { AgentRun } from './AgentRun'
import { CopilotPanel } from '../chat/CopilotPanel'
import { useCopilotAvailable } from '../chat/useCopilotAvailable'
import styles from './Home.module.css'

/**
 * The chat page: only the chat. The model chat (CopilotKit) is used when the assistant server has a key; otherwise the built-in rule-based assistant answers.
 */
export function Chat() {
  const { chat, pending, send } = useAssistantChat()
  const projects = useProjects()
  const { state: copilot, reason: copilotReason } = useCopilotAvailable()

  const messages: ChatMessageView[] = [
    { id: 'hello', role: 'assistant', text: 'Hi, I am the Procurement Intelligence assistant. Tell me which project you want help with, by name or id, or ask for one of the mock projects. I will gather its records and set up planning, tender design, monitoring and learning for you.' },
    ...chat.map((e): ChatMessageView => (e.role === 'assistant' && e.reply
      ? { id: e.id, role: 'assistant', text: '', extra: <AgentRun entry={{ ...e, reply: e.reply }} onSend={send} /> }
      : { id: e.id, role: e.role, text: e.text })),
  ]
  // Follow-ups come from the latest answer (they depend on the project and on what was just shown); before the first answer, a starter list.
  const latest = [...chat].reverse().find((e) => e.reply)?.reply
  // The built-in assistant answers about one named project, so its starters are the real projects (the ones with most to show first) and then the mock one.
  const starters = [...(projects.data ?? [])].sort((a, b) => Number(projectScope(a.project_id) === 'mock') - Number(projectScope(b.project_id) === 'mock'))
  const suggestions = latest?.suggestions ?? [...starters.slice(0, 5).map((p) => `Help me with ${p.project_name}`), 'What is the data source?']

  return (
    <div className={styles.chatPage}>
      {copilot === 'off' && copilotReason && <p role="status" className={styles.modelNote}>Model chat unavailable: {copilotReason}. Using the built-in rule-based assistant.</p>}
      {copilot === 'on'
        ? <CopilotPanel onEngage={() => undefined} />
        : <ChatWindow onEngage={() => undefined} size="full" messages={messages} onSend={send} pending={pending} suggestions={suggestions} placeholder="e.g. Help me with the road project" />}
    </div>
  )
}
