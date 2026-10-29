import { LIFECYCLE_STEPS } from '@pi/config'
import { lifecycleStatus, useMyLifecycle, type FeatureOption, type LifecycleStage, type NewLifecycleItem } from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip } from '@pi/ui'
import styles from './MyLifecycle.module.css'

const labelOf = (stage: LifecycleStage) => LIFECYCLE_STEPS.find((s) => s.id === stage)?.label ?? stage

/** What to say to ask for the next piece of an empty stage. */
const NEXT_PROMPT: Record<LifecycleStage, string> = {
  planning: 'Help me plan my procurement',
  'tender-design': 'Suggest tender clauses for my own procurement',
  monitoring: 'How can I evaluate and monitor my project?',
  learning: 'How should I add learning to my project?',
}

/** The button on a suggestion: puts it in the user's own lifecycle, or takes it out again. The suggestion keeps its basis. */
export function AddToLifecycle({ item, label = 'Add to my lifecycle' }: { item: NewLifecycleItem; label?: string }) {
  const present = useMyLifecycle((s) => s.items.find((i) => i.key === item.key))
  const add = useMyLifecycle((s) => s.add)
  const remove = useMyLifecycle((s) => s.remove)
  return present
    ? <Button onClick={() => remove(present.id)} aria-pressed="true">In my lifecycle · remove</Button>
    : <Button variant="primary" onClick={() => add(item)}>{label}</Button>
}

/** The monitoring or learning features the user can pick from, each with what it needs and an Add button. */
export function FeatureOptions({ stage, title, options }: { stage: Extract<LifecycleStage, 'monitoring' | 'learning'>; title: string; options: FeatureOption[] }) {
  return (
    <Card title={title} aside={<ProvenanceChip kind="derived" detail="features of this app" />}>
      <ul className={styles.list}>
        {options.map((o) => (
          <li key={o.id}>
            <div>
              <strong>{o.title}</strong>
              <p className={styles.sub}>{o.what}</p>
              <p className={styles.sub}>Uses: {o.uses}</p>
            </div>
            <AddToLifecycle item={{ key: `${stage}:${o.id}`, stage, kind: stage === 'monitoring' ? 'monitoring-feature' : 'learning-feature', title: o.title, summary: o.what, basis: `A feature of this app. Uses: ${o.uses}.`, detail: o }} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** The user's own lifecycle: what they have added per stage, what is still empty, and a button to ask for the next piece. */
export function MyLifecycleCard({ onSend }: { onSend?: (text: string) => void }) {
  const { name, items, remove, rename, clear } = useMyLifecycle()
  const { byStage, missing, complete } = lifecycleStatus(items)
  return (
    <Card title="My lifecycle" aside={<Badge tone={complete ? 'low' : 'medium'}>{complete ? 'Complete' : `${missing.length} stage${missing.length === 1 ? '' : 's'} empty`}</Badge>}>
      <label className={styles.name}>Name
        <input value={name} onChange={(e) => rename(e.target.value)} maxLength={80} />
      </label>
      <p className={styles.sub}>Kept for this browser session only. Everything here is a suggestion you chose to add, with the basis it came with.</p>
      {(Object.keys(byStage) as LifecycleStage[]).map((stage) => (
        <section key={stage} className={styles.stage} aria-label={labelOf(stage)}>
          <h4>{labelOf(stage)}</h4>
          {byStage[stage].length === 0 ? (
            <EmptyState title="Nothing added yet" text="Ask for a suggestion and press Add to my lifecycle." />
          ) : (
            <ul className={styles.list}>
              {byStage[stage].map((i) => (
                <li key={i.id}>
                  <div>
                    <strong>{i.title}</strong> <ProvenanceChip kind="derived" detail="suggested" />
                    <p className={styles.sub}>{i.summary}</p>
                    <p className={styles.sub}>Basis: {i.basis}</p>
                  </div>
                  <Button onClick={() => remove(i.id)}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          {byStage[stage].length === 0 && onSend && <Button onClick={() => onSend(NEXT_PROMPT[stage])}>{NEXT_PROMPT[stage]}</Button>}
        </section>
      ))}
      {items.length > 0 && <div className={styles.actions}><Button onClick={clear}>Clear my lifecycle</Button></div>}
    </Card>
  )
}
