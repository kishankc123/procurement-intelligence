import { lazy, useState } from 'react'
import { LIFECYCLE_STEPS } from '@pi/config'
import { useProjects, type Block, type LifecycleStage } from '@pi/data'
import { Badge, CircleCheck, DonutNav, ProvenanceChip } from '@pi/ui'
import { FeedbackWidget } from '@pi/domain'
import { RemoteBoundary } from '../RemoteBoundary'
import { STEP_COLOR } from '../stepColors'
import { TenderDraftCard } from './TenderDraftCard'
import { useStageFacts } from './useStageFacts'
import styles from './ChatBlocks.module.css'

const PlanningCard = lazy(() => import('planning/PlanningCard'))
const MonitoringCard = lazy(() => import('monitoring/MonitoringCard'))
const LearningCard = lazy(() => import('learning/LearningCard'))

const SEGMENTS = LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: s.label, color: STEP_COLOR[s.id] ?? 'var(--primary)' }))
const labelOf = (id: string) => LIFECYCLE_STEPS.find((s) => s.id === id)?.label ?? id

/** The lifecycle donut. A click asks the assistant for that stage, so the transcript stays the record of what the user did. */
function Donut({ activeId, onSend, compact, size, centre }: { activeId: string | null; onSend: (text: string) => void; compact?: boolean; size?: string; centre?: React.ReactNode }) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  return (
    <DonutNav
      ariaLabel="Project lifecycle" compact={compact} size={size} segments={SEGMENTS}
      activeId={hoverId ?? activeId} onActiveChange={setHoverId}
      onSelect={(id) => onSend(`Show ${labelOf(id)}`)} centre={centre}
    />
  )
}

/** The big donut, with what the project has per stage underneath (also buttons, for keyboard and touch users). */
function BigDonut({ projectId, onSend, heading }: { projectId: string; onSend: (text: string) => void; heading: React.ReactNode }) {
  const project = useProjects().data?.find((p) => p.project_id === projectId)
  const facts = useStageFacts(projectId)
  return (
    <section className={styles.block} aria-label="Project lifecycle">
      {heading}
      <div className={styles.big}>
        <Donut activeId={null} onSend={onSend} size="min(380px, 100%)" centre={<span className={styles.centre}>{project?.project_name ?? projectId}</span>} />
      </div>
      <ul className={styles.facts}>
        {LIFECYCLE_STEPS.map((s) => (
          <li key={s.id} style={{ borderTopColor: STEP_COLOR[s.id] }}>
            <button type="button" onClick={() => onSend(`Show ${s.label}`)}>{s.label}</button>
            <span className={styles.sub}>{facts[s.id as LifecycleStage].text}</span>
            <ProvenanceChip kind={facts[s.id as LifecycleStage].kind} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One stage, headed by the small donut so the user can move to any other stage. The stage's own cards are added step by step. */
function Stage({ step, projectId, onSend }: { step: LifecycleStage; projectId: string; onSend: (text: string) => void }) {
  const project = useProjects().data?.find((p) => p.project_id === projectId)
  const fact = useStageFacts(projectId)[step]
  return (
    <section className={styles.block} aria-label={labelOf(step)}>
      <div className={styles.stageHead}>
        <div className={styles.small}><Donut activeId={step} onSend={onSend} compact /></div>
        <div>
          <p className={styles.eyebrow}>Lifecycle step</p>
          <h3>{labelOf(step)}</h3>
          <p className={styles.sub}>{project?.project_name ?? projectId} · <span className="mono">{projectId}</span></p>
        </div>
      </div>
      {step === 'planning' ? (
        <RemoteBoundary name="Planning"><PlanningCard projectId={projectId} /></RemoteBoundary>
      ) : step === 'tender-design' ? (
        <TenderDraftCard projectId={projectId} />
      ) : step === 'monitoring' ? (
        <RemoteBoundary name="Monitoring"><MonitoringCard projectId={projectId} /></RemoteBoundary>
      ) : step === 'learning' ? (
        <RemoteBoundary name="Learning"><LearningCard projectId={projectId} /></RemoteBoundary>
      ) : (
        <>
          <p className={styles.fact}><ProvenanceChip kind={fact.kind} /> {fact.text}</p>
          <p className={styles.sub}><Badge>Planned</Badge> The cards for this stage are built next. The donut above already switches stages.</p>
        </>
      )}
    </section>
  )
}

/**
 * What the feedback on a card is about. The Learning page reads the layer from the third part of the id
 * (AI-LAYER-<layer>-<project>), so each kind of card has one layer name without a hyphen.
 */
export function feedbackTarget(block: Block): string {
  const layer = block.type === 'stage' ? (block.step === 'tender-design' ? 'tender' : block.step) : block.type
  return `AI-LAYER-chat${layer}-${block.projectId}`
}

function BlockBody({ block, onSend }: { block: Block; onSend: (text: string) => void }) {
  switch (block.type) {
    case 'ready':
      return <BigDonut projectId={block.projectId} onSend={onSend} heading={<h3 className={styles.ready}><CircleCheck size={18} aria-hidden="true" /> Your procurement solution is ready</h3>} />
    case 'lifecycle':
      return <BigDonut projectId={block.projectId} onSend={onSend} heading={<h3>The whole lifecycle</h3>} />
    case 'stage':
      return <Stage step={block.step} projectId={block.projectId} onSend={onSend} />
  }
}

/** Draws what the assistant asked for under its answer, with Helpful / Not helpful, which lands in the Learning queue. */
export function BlockView({ block, onSend }: { block: Block; onSend: (text: string) => void }) {
  return (
    <div className={styles.blockWrap}>
      <BlockBody block={block} onSend={onSend} />
      <div className={styles.rate}>
        <span className={styles.sub}>Was this useful?</span>
        <FeedbackWidget targetId={feedbackTarget(block)} />
      </div>
    </div>
  )
}
