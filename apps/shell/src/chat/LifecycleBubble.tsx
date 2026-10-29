import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pi/ui'
import { projectScope, useMyLifecycle, useProjects, useUiStore } from '@pi/data'
import { STEP_COLOR } from '../stepColors'
import { BlockView } from './ChatBlocks'
import { MyLifecycleCard } from './MyLifecycle'
import styles from './LifecycleBubble.module.css'

/** A small ring in the four stage colours: the same shape as the lifecycle donut, so the bubble reads as "the lifecycle". */
function RingIcon() {
  const stages = ['planning', 'tender-design', 'monitoring', 'learning']
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      {stages.map((id, i) => (
        <circle key={id} cx="12" cy="12" r="8" fill="none" strokeWidth="4" pathLength="100" stroke={STEP_COLOR[id]} strokeDasharray="21 79" strokeDashoffset={-(i * 25)} transform="rotate(-90 12 12)" />
      ))}
    </svg>
  )
}

/**
 * A round button fixed to the corner of the screen that opens the lifecycle in a modal, so it can be read at any point of a long conversation without
 * scrolling back. The modal has the user's own lifecycle and, when a project is in context, a second tab with that project's lifecycle donut.
 * A button inside it that asks the assistant for something sends the message and closes the modal, so the answer is in view.
 */
export function LifecycleBubble({ open, onOpenChange, onSend }: { open: boolean; onOpenChange: (open: boolean) => void; onSend: (text: string) => void }) {
  const count = useMyLifecycle((s) => s.items.length)
  const chatProjectId = useUiStore((s) => s.chatProjectId)
  const project = useProjects().data?.find((p) => p.project_id === chatProjectId)
  const [view, setView] = useState<'mine' | 'project'>('mine')
  const shown = view === 'project' && project ? 'project' : 'mine'
  const ask = (text: string) => { onSend(text); onOpenChange(false) }

  return (
    <>
      <button type="button" className={styles.bubble} onClick={() => onOpenChange(true)} aria-haspopup="dialog" aria-label={`Open the lifecycle. My lifecycle has ${count} ${count === 1 ? 'item' : 'items'}.`}>
        <RingIcon />
        <span className={styles.count} aria-hidden="true">{count}</span>
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lifecycle</DialogTitle>
            <DialogDescription>Open from anywhere in the chat. Your own lifecycle is kept for this browser session.</DialogDescription>
          </DialogHeader>
          {project && (
            <div className={styles.tabs} role="tablist" aria-label="Which lifecycle">
              <button type="button" role="tab" aria-selected={shown === 'mine'} className={`${styles.tab} ${shown === 'mine' ? styles.tabOn : ''}`} onClick={() => setView('mine')}>My lifecycle</button>
              <button type="button" role="tab" aria-selected={shown === 'project'} className={`${styles.tab} ${shown === 'project' ? styles.tabOn : ''}`} onClick={() => setView('project')}>
                {project.project_name} <span className={styles.scope}>({projectScope(project.project_id)})</span>
              </button>
            </div>
          )}
          {shown === 'project' && project
            ? <BlockView block={{ type: 'lifecycle', projectId: project.project_id }} onSend={ask} />
            : <MyLifecycleCard onSend={ask} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
