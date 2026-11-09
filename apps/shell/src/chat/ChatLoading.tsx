import { LIFECYCLE_STEPS } from '@pi/config'
import { DonutNav } from '@pi/ui'
import { STEP_COLOR } from '../stepColors'
import styles from './ChatLoading.module.css'

/** Shown while the chat is finding out which assistant to use, so the page never flashes the built-in chat first: the lifecycle donut with its dotted orbit turning. */
export function ChatLoading() {
  return (
    <div className={styles.box} role="status" aria-live="polite" aria-busy="true">
      <DonutNav
        busy
        ariaLabel="Loading the assistant"
        size="min(220px, 60vw)"
        segments={LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: s.label, color: STEP_COLOR[s.id] ?? 'var(--primary)' }))}
        activeId={null}
        onActiveChange={() => undefined}
        onSelect={() => undefined}
      />
      <p className={styles.text}>Getting the assistant ready<span className={styles.dots} aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
    </div>
  )
}
