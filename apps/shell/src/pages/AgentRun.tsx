import { useEffect, useState } from 'react'
import { useUiStore, type AssistantReply, type ChatEntry } from '@pi/data'
import { Badge, Button, CircleCheck } from '@pi/ui'
import { BlockView } from '../chat/ChatBlocks'
import styles from './AgentRun.module.css'

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One assistant answer: the services it called (shown one by one, labelled Simulated), then the text, then the ready card.
 * A reply plays once, as it arrives; coming back to the page later shows it complete.
 */
export function AgentRun({ entry, onSend }: { entry: ChatEntry & { reply: AssistantReply }; onSend: (text: string) => void }) {
  const { reply } = entry
  const setProject = useUiStore((s) => s.setProject)
  const finish = useUiStore((s) => s.finishChat)
  const play = Boolean(entry.animate) && !reduceMotion()
  const [shown, setShown] = useState(play ? 0 : reply.steps.length)

  useEffect(() => {
    if (!play) return
    const timer = setInterval(() => setShown((n) => Math.min(n + 1, reply.steps.length)), 420)
    return () => clearInterval(timer)
  }, [play, reply.steps.length])

  const done = shown >= reply.steps.length
  // The reply is complete: make its project the one every other screen shows, once.
  useEffect(() => {
    if (done && entry.animate) {
      if (reply.dossier) setProject(reply.dossier.projectId)
      finish(entry.id)
    }
  }, [done, entry.animate, entry.id, finish, reply.dossier, setProject])

  return (
    <div className={styles.run}>
      {reply.steps.length > 0 && (
        <details className={styles.log} open={!done || undefined} key={done ? 'done' : 'running'}>
          <summary className={styles.logHead}><strong>Agent run</strong> <Badge>Simulated</Badge> <span className={styles.sub}>{done ? `${reply.steps.length} ${reply.steps.length === 1 ? 'step' : 'steps'}. Click to see what each service returned.` : 'Rule-based over mock data. No model is connected.'}</span></summary>
          <ol>
            {reply.steps.slice(0, shown).map((s) => (
              <li key={s.id}>
                <CircleCheck size={16} aria-hidden="true" />
                <span><strong>{s.service}</strong>: {s.label}<br /><span className={styles.sub}>{s.detail}</span></span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {done && <p className={styles.text}>{reply.reply}</p>}
      {done && reply.blocks.length === 0 && reply.options.length > 0 && (
        <div className={styles.options} aria-label="Projects to choose from">
          {reply.options.map((o) => <Button key={o.projectId} onClick={() => onSend(o.prompt)}>{o.label}</Button>)}
        </div>
      )}
      {done && reply.blocks.map((b, i) => <BlockView key={`${b.type}-${i}`} block={b} onSend={onSend} />)}
    </div>
  )
}
