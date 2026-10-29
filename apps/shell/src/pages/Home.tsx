import { useState } from 'react'
import { LIFECYCLE_STEPS } from '@pi/config'
import { useAssistantChat, useProjects } from '@pi/data'
import { DonutNav } from '@pi/ui'
import { ChatWindow, type ChatMessageView } from '@pi/domain'
import { STEP_COLOR } from '../stepColors'
import { AgentRun } from './AgentRun'
import styles from './Home.module.css'

/**
 * The landing page. Before anyone speaks it is the lifecycle donut with a line of text, and the chat underneath.
 * As soon as the chat is used (the input is focused, or a message is sent) the donut and its text go away and the chat takes the page.
 */
export function Home() {
  const { chat, pending, send } = useAssistantChat()
  const projects = useProjects()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [clicked, setClicked] = useState(false)
  const engaged = clicked || chat.length > 0 || pending
  const active = LIFECYCLE_STEPS.find((s) => s.id === hoverId) ?? null

  const messages: ChatMessageView[] = [
    { id: 'hello', role: 'assistant', text: 'Hi, I am the Procurement Intelligence assistant. Tell me which project you want help with, by name or id, or ask for one of the mock projects. I will gather its records and set up planning, tender design, monitoring and learning for you.' },
    ...chat.map((e): ChatMessageView => (e.role === 'assistant' && e.reply
      ? { id: e.id, role: 'assistant', text: '', extra: <AgentRun entry={{ ...e, reply: e.reply }} onSend={send} /> }
      : { id: e.id, role: e.role, text: e.text })),
  ]
  // Follow-ups come from the latest answer (they depend on the project and on what was just shown); before the first answer, a starter list.
  const latest = [...chat].reverse().find((e) => e.reply)?.reply
  const suggestions = latest?.suggestions ?? ['Help me with one of the mock projects', ...(projects.data ?? []).map((p) => `Help me with ${p.project_name}`), 'What is the data source?']

  return (
    <div className={styles.landing}>
      {!engaged && (
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.heroTitle}>What the assistant sets up</h1>
          <p className={styles.sub}>Four lifecycle steps on one traceable record. Hover a step to see what it does, or click one to ask the assistant about it.</p>
          <DonutNav
            ariaLabel="Project lifecycle"
            size="var(--donut)"
            segments={LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: s.label, color: STEP_COLOR[s.id] ?? 'var(--primary)' }))}
            activeId={hoverId}
            onActiveChange={setHoverId}
            onSelect={(id) => send(`Show ${LIFECYCLE_STEPS.find((s) => s.id === id)?.label ?? id}`)}
          />
          <div className={styles.info} style={{ borderTopColor: active ? STEP_COLOR[active.id] : undefined }} aria-live="polite">
            {active ? (
              <>
                <h2 className={styles.infoTitle}>{active.label}</h2>
                <p className={styles.infoText}>{active.summary}</p>
              </>
            ) : <p className={styles.infoText}>Hover a step to see what it does.</p>}
          </div>
        </section>
      )}
      <div className={styles.chatWrap}>
        <ChatWindow onEngage={() => setClicked(true)} size={engaged ? 'full' : 'compact'} messages={messages} onSend={send} pending={pending} suggestions={suggestions} placeholder="e.g. Help me with the road project" />
      </div>
    </div>
  )
}
