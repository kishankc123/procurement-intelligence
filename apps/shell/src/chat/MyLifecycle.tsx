import { lazy, useRef, useState } from 'react'
import { LIFECYCLE_STEPS } from '@pi/config'
import { lifecycleStatus, useExampleProject, useMyLifecycle, type FeatureOption, type LifecycleItem, type LifecycleStage, type NewLifecycleItem } from '@pi/data'
import { Badge, Button, Card, DonutNav, DownloadPng, EmptyState, ProvenanceChip } from '@pi/ui'
import { RemoteBoundary } from '../RemoteBoundary'
import { STEP_COLOR } from '../stepColors'
import { downloadLifecycleDocx } from './exportLifecycle'
import { ClausesDetail, FeatureDetail, PlanDetail, RowsDetail, TimelineDetail } from './lifecycleDetail'
import styles from './MyLifecycle.module.css'

// The user's lifecycle is drawn with the micro front-ends' own components, the same ones a stored project's stages are made of.
const PlanProposalCard = lazy(() => import('planning/PlanProposalCard'))
const EstimateTimelineCard = lazy(() => import('planning/EstimateTimelineCard'))
const MonitoringFeature = lazy(() => import('monitoring/MonitoringFeature'))
const LearningFeature = lazy(() => import('learning/LearningFeature'))

/**
 * One monitoring or learning feature, drawn by the monitoring or learning micro front-end. A user's own project has no data yet, so it is shown with a
 * stored project's data as an example, and says so; their own data replaces it once they have it.
 */
export function FeatureView({ stage, featureId }: { stage: 'monitoring' | 'learning'; featureId: string }) {
  const example = useExampleProject()
  if (!example) return <EmptyState title="No example to draw" text="No stored project has the data this feature needs yet." />
  return (
    <div className={styles.feature}>
      <p className={styles.sub}>Shown with the data of <strong>{example.project_name}</strong> <span className="mono">{example.project_id}</span> as an example. Your own project's data replaces it.</p>
      {stage === 'monitoring'
        ? <RemoteBoundary name="Monitoring"><MonitoringFeature feature={featureId as 'disbursement-chart' | 'project-schedule' | 'early-warning'} projectId={example.project_id} /></RemoteBoundary>
        : <RemoteBoundary name="Learning"><LearningFeature feature={featureId as 'feedback-queue' | 'learning-figures'} projectId={example.project_id} /></RemoteBoundary>}
    </div>
  )
}

/** An item in the lifecycle, drawn the way its stage is drawn elsewhere: the plan on the planning calendar and timeline, clauses and figures as tables, features as the micro front-end's cards. */
function ItemView({ item }: { item: LifecycleItem }) {
  if (item.kind === 'plan') {
    const d = PlanDetail.safeParse(item.detail)
    if (d.success) return <RemoteBoundary name="Planning"><PlanProposalCard proposal={d.data} /></RemoteBoundary>
  }
  if (item.kind === 'tender-clauses') {
    const d = ClausesDetail.safeParse(item.detail)
    if (d.success) {
      return (
        <table className={styles.table}>
          <tbody>
            {d.data.clauses.map((c) => (
              <tr key={c.label}><th scope="row">{c.label}</th><td>{typeof c.value === 'number' ? c.value.toLocaleString('en-US') : c.value}{c.unit ? ` ${c.unit}` : ''}</td><td>{c.source === 'mock' ? <Badge tone="medium">Demonstration</Badge> : c.source === 'real' ? <Badge tone="low">Real data</Badge> : null}</td></tr>
            ))}
          </tbody>
        </table>
      )
    }
  }
  if (item.kind === 'estimates') {
    const d = RowsDetail.safeParse(item.detail)
    const timeline = TimelineDetail.safeParse((item.detail as { timeline?: unknown } | null)?.timeline)
    if (d.success) {
      return (
        <>
        {timeline.success && <RemoteBoundary name="Planning"><EstimateTimelineCard timeline={timeline.data} /></RemoteBoundary>}
        <table className={styles.table}>
          <tbody>
            {d.data.rows.filter((r) => r.value !== null).map((r) => (
              <tr key={r.metric}><th scope="row">{r.metric}</th><td>{typeof r.value === 'number' ? r.value.toLocaleString('en-US') : r.value}{r.unit ? ` ${r.unit}` : ''}</td><td><ProvenanceChip kind="derived" detail={`n=${r.n} ${r.counts}`} />{r.thin && <> <Badge tone="medium">Thin sample</Badge></>}</td></tr>
            ))}
          </tbody>
        </table>
        </>
      )
    }
  }
  if (item.kind === 'monitoring-feature' || item.kind === 'learning-feature') {
    const d = FeatureDetail.safeParse(item.detail)
    if (d.success) return <FeatureView stage={item.kind === 'monitoring-feature' ? 'monitoring' : 'learning'} featureId={d.data.id} />
  }
  return null
}

/** One item with its heading, basis and view. Remove and the PNG button are left out of the picture the PNG button saves. */
function ItemRow({ item, onRemove }: { item: LifecycleItem; onRemove: () => void }) {
  const ref = useRef<HTMLLIElement>(null)
  return (
    <li ref={ref} className={styles.item}>
      <div className={styles.itemHead}>
        <div>
          <strong>{item.title}</strong> <ProvenanceChip kind="derived" detail="suggested" />
          <p className={styles.sub}>Basis: {item.basis}</p>
        </div>
        <div className={styles.row} data-export-ignore="">
          <DownloadPng targetRef={ref} name={item.title} />
          <Button onClick={onRemove}>Remove</Button>
        </div>
      </div>
      <ItemView item={item} />
    </li>
  )
}

const labelOf = (stage: LifecycleStage) => LIFECYCLE_STEPS.find((s) => s.id === stage)?.label ?? stage
const STAGE_IDS = LIFECYCLE_STEPS.map((s) => s.id as LifecycleStage)

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
  const [preview, setPreview] = useState<string | null>(null)
  return (
    <Card title={title} aside={<ProvenanceChip kind="derived" detail="features of this app" />}>
      <ul className={styles.list}>
        {options.map((o) => (
          <li key={o.id}>
            <div>
              <strong>{o.title}</strong>
              <p className={styles.sub}>{o.what}</p>
              <p className={styles.sub}>Uses: {o.uses}</p>
              <Button onClick={() => setPreview(preview === o.id ? null : o.id)} aria-expanded={preview === o.id}>{preview === o.id ? 'Hide preview' : 'Preview'}</Button>
              {preview === o.id && <FeatureView stage={stage} featureId={o.id} />}
            </div>
            <AddToLifecycle item={{ key: `${stage}:${o.id}`, stage, kind: stage === 'monitoring' ? 'monitoring-feature' : 'learning-feature', title: o.title, summary: o.what, basis: `A feature of this app. Uses: ${o.uses}.`, detail: o }} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * The user's own lifecycle as the same donut a stored project has. A slice is in its full colour once something has been added to that stage and faded while
 * it is empty, so the donut fills in as the lifecycle is built. Clicking a stage (on the donut or on its tile) shows what was added to it; an empty stage
 * offers a button to ask for the next suggestion. The stages keep the planning names (Planning, Tender design, Monitoring, Learning).
 */
export function MyLifecycleCard({ onSend }: { onSend?: (text: string) => void }) {
  const { name, items, remove, rename, clear } = useMyLifecycle()
  const { byStage, missing, complete } = lifecycleStatus(items)
  const [picked, setPicked] = useState<LifecycleStage | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const shown: LifecycleStage = picked ?? (STAGE_IDS.find((st) => byStage[st].length > 0) ?? 'planning')
  const segments = LIFECYCLE_STEPS.map((step) => {
    const filled = byStage[step.id as LifecycleStage].length > 0
    const color = STEP_COLOR[step.id] ?? 'var(--primary)'
    return { id: step.id, label: step.label, color: filled ? color : `color-mix(in srgb, ${color} 30%, var(--surface))` }
  })
  return (
    <Card title="My lifecycle" downloadName={name} aside={<span className={styles.row}><Badge tone={complete ? 'low' : 'medium'}>{complete ? 'Complete' : `${missing.length} stage${missing.length === 1 ? '' : 's'} empty`}</Badge><Button disabled={items.length === 0} title={items.length === 0 ? 'Add something to the lifecycle first' : 'Every stage and item as a Word file; opens in Google Docs too'} onClick={() => void downloadLifecycleDocx(name, items)}>Download all (.docx)</Button></span>}>
      <label className={styles.name}>Name
        <input value={name} onChange={(e) => rename(e.target.value)} maxLength={80} />
      </label>
      <p className={styles.sub}>Kept for this browser session only. Everything here is a suggestion you chose to add, with the basis it came with. Stages in full colour have something in them.</p>
      <div className={styles.big}>
        <DonutNav
          ariaLabel="My lifecycle" size="min(340px, 100%)" segments={segments} activeId={hover ?? shown}
          onActiveChange={setHover} onSelect={(id) => setPicked(id as LifecycleStage)}
          centre={<span className={styles.centre}>{name}</span>}
        />
      </div>
      <ul className={styles.facts}>
        {LIFECYCLE_STEPS.map((step) => {
          const id = step.id as LifecycleStage
          const n = byStage[id].length
          return (
            <li key={id} style={{ borderTopColor: n > 0 ? STEP_COLOR[id] : undefined }} aria-current={id === shown ? 'true' : undefined}>
              <button type="button" onClick={() => setPicked(id)}>{step.label}</button>
              <span className={styles.sub}>{n > 0 ? `${n} ${n === 1 ? 'item' : 'items'} added` : 'Nothing added yet'}</span>
              <ProvenanceChip kind={n > 0 ? 'derived' : 'missing'} detail={n > 0 ? 'suggested' : undefined} />
            </li>
          )
        })}
      </ul>
      <section className={styles.stage} aria-label={labelOf(shown)} aria-live="polite">
        <h4>{labelOf(shown)}</h4>
        {byStage[shown].length === 0 ? (
          <>
            <EmptyState title="Nothing added yet" text="Ask for a suggestion and press Add to my lifecycle." />
            {onSend && <Button variant="primary" onClick={() => onSend(NEXT_PROMPT[shown])}>{NEXT_PROMPT[shown]}</Button>}
          </>
        ) : (
          <ul className={styles.list}>
            {byStage[shown].map((i) => <ItemRow key={i.id} item={i} onRemove={() => remove(i.id)} />)}
          </ul>
        )}
      </section>
      {items.length > 0 && <div className={styles.actions}><Button onClick={clear}>Clear my lifecycle</Button></div>}
    </Card>
  )
}
