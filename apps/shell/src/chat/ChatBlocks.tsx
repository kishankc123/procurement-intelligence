import { lazy, useRef, useState } from 'react'
import { LIFECYCLE_STEPS, PAST_STAGE_LABEL } from '@pi/config'
import { usePlan, usePlanPackages, useProjects, type Block, type LifecycleStage } from '@pi/data'
import { Badge, CircleCheck, DonutNav, DownloadPng, ProvenanceChip } from '@pi/ui'
import { FeedbackWidget } from '@pi/domain'
import { DownloadProject } from '../exportProject'
import { RemoteBoundary } from '../RemoteBoundary'
import { STEP_COLOR } from '../stepColors'
import { CardBoundary, MissingInfo } from './CardBoundary'
import { ContractsCard } from './ContractsCard'
import { KnowledgeCard } from './KnowledgeCard'
import { SuppliersCard } from './SuppliersCard'
import { TenderDraftCard } from './TenderDraftCard'
import { PlanOnRecord } from './OnRecordCards'
import { EvidenceCard } from '../pages/Evidence'
import tool from './ToolCards.module.css'
import { useStageFacts } from './useStageFacts'
import styles from './ChatBlocks.module.css'

const PlanningCard = lazy(() => import('planning/PlanningCard'))
const MonitoringCard = lazy(() => import('monitoring/MonitoringCard'))
const LearningCard = lazy(() => import('learning/LearningCard'))

// The stages of a project that exists are named for what happened (Plans executed, Tenders published, Evaluation, Feedback); the user's own lifecycle keeps the planning names.
const labelOf = (id: string) => PAST_STAGE_LABEL[id] ?? LIFECYCLE_STEPS.find((s) => s.id === id)?.label ?? id
const SEGMENTS = LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: labelOf(s.id), color: STEP_COLOR[s.id] ?? 'var(--primary)' }))

/** The lifecycle donut. A click asks the assistant for that stage, so the transcript stays the record of what the user did. */
function Donut({ activeId, onSend, about, compact, size, centre }: { activeId: string | null; onSend: (text: string) => void; /** What the click is about, so the message names its project ("for Name (P123)") instead of leaving the assistant to guess. */ about: string; compact?: boolean; size?: string; centre?: React.ReactNode }) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  return (
    <DonutNav
      ariaLabel="Project lifecycle" compact={compact} size={size} segments={SEGMENTS}
      activeId={hoverId ?? activeId} onActiveChange={setHoverId}
      onSelect={(id) => onSend(`Show ${labelOf(id).toLowerCase()} ${about}`)} centre={centre}
    />
  )
}

/** The big donut, with what the project has per stage underneath (also buttons, for keyboard and touch users). */
function BigDonut({ projectId, onSend, heading }: { projectId: string; onSend: (text: string) => void; heading: React.ReactNode }) {
  const project = useProjects().data?.find((p) => p.project_id === projectId)
  const facts = useStageFacts(projectId)
  const about = `for ${project?.project_name ?? projectId} (${projectId})`
  return (
    <section className={styles.block} aria-label="Project lifecycle">
      {heading}
      <div className={styles.big}>
        <Donut activeId={null} onSend={onSend} about={about} size="min(380px, 100%)" centre={<span className={styles.centre}>{project?.project_name ?? projectId}</span>} />
      </div>
      <ul className={styles.facts}>
        {LIFECYCLE_STEPS.map((s) => (
          <li key={s.id} style={{ borderTopColor: STEP_COLOR[s.id] }}>
            <button type="button" onClick={() => onSend(`Show ${labelOf(s.id).toLowerCase()} ${about}`)}>{labelOf(s.id)}</button>
            <span className={styles.sub}>{facts[s.id as LifecycleStage].text}</span>
            <ProvenanceChip kind={facts[s.id as LifecycleStage].kind} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The plans a project has: saved plans (the Planning card) and the plan rows read from a World Bank plan document. Whichever exist are shown; the Planning card's own empty state shows only when neither does. */
function PlanningStage({ projectId }: { projectId: string }) {
  const plans = usePlan(projectId)
  const packages = usePlanPackages(projectId)
  const hasRows = (packages.data?.length ?? 0) > 0
  const hasPlans = (plans.data?.length ?? 0) > 0
  return (
    <>
      {(hasPlans || !hasRows) && <RemoteBoundary name="Planning"><PlanningCard projectId={projectId} /></RemoteBoundary>}
      {hasRows && <PlanOnRecord projectId={projectId} />}
    </>
  )
}

/** One stage, headed by the small donut so the user can move to any other stage. The stage's own cards are added step by step. */
function Stage({ step, projectId, onSend }: { step: LifecycleStage; projectId: string; onSend: (text: string) => void }) {
  const project = useProjects().data?.find((p) => p.project_id === projectId)
  const fact = useStageFacts(projectId)[step]
  return (
    <section className={styles.block} aria-label={labelOf(step)}>
      <div className={styles.stageHead}>
        <div className={styles.small}><Donut activeId={step} onSend={onSend} about={`for ${project?.project_name ?? projectId} (${projectId})`} compact /></div>
        <div>
          <p className={styles.eyebrow}>Lifecycle step</p>
          <h3>{labelOf(step)}</h3>
          <p className={styles.sub}>{project?.project_name ?? projectId} · <span className="mono">{projectId}</span></p>
        </div>
      </div>
      {step === 'planning' ? (
        <PlanningStage projectId={projectId} />
      ) : step === 'tender-design' ? (
        <TenderDraftCard projectId={projectId} onSend={onSend} />
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
  const layer = block.type === 'stage' ? (block.step === 'tender-design' ? 'tender' : block.step) : block.type === 'tool' ? block.tool.replace('-', '') : block.type
  return `AI-LAYER-chat${layer}-${block.projectId ?? 'all'}`
}

const TOOL_TITLE: Record<Extract<Block, { type: 'tool' }>['tool'], string> = { suppliers: 'Suppliers', 'project-data': 'Project data', knowledge: 'Knowledge base', evidence: 'Evidence workbench' }

/** One tool as a card. Tools that need a project say so (as missing information) when none is known; the knowledge base and evidence do not. */
function ToolView({ block }: { block: Extract<Block, { type: 'tool' }> }) {
  const project = useProjects().data?.find((p) => p.project_id === block.projectId)
  const pid = block.projectId
  return (
    <section className={styles.block} aria-label={TOOL_TITLE[block.tool]}>
      <div>
        <p className={styles.eyebrow}>Tool</p>
        <h3>{TOOL_TITLE[block.tool]}</h3>
        <p className={styles.sub}>{pid ? <>{project?.project_name ?? pid} · <span className="mono">{pid}</span></> : 'All projects'}</p>
      </div>
      <div className={tool.card}>
        {block.tool === 'suppliers' && (pid ? <SuppliersCard projectId={pid} /> : <MissingInfo title="Suppliers" text="Choose a project first: suppliers are listed per project." />)}
        {block.tool === 'project-data' && (pid ? <ContractsCard projectId={pid} /> : <MissingInfo title="Contracts" text="Choose a project first: contracts are listed per project." />)}
        {block.tool === 'knowledge' && <KnowledgeCard projectId={pid} />}
        {block.tool === 'evidence' && <EvidenceCard projectId={pid} />}
      </div>
    </section>
  )
}

function BlockBody({ block, onSend }: { block: Block; onSend: (text: string) => void }) {
  switch (block.type) {
    case 'ready':
      return <BigDonut projectId={block.projectId} onSend={onSend} heading={<h3 className={styles.ready}><CircleCheck size={18} aria-hidden="true" /> Your procurement solution is ready</h3>} />
    case 'lifecycle':
      return <BigDonut projectId={block.projectId} onSend={onSend} heading={<h3>The whole lifecycle</h3>} />
    case 'stage':
      return <Stage step={block.step} projectId={block.projectId} onSend={onSend} />
    case 'tool':
      return <ToolView block={block} />
  }
}

/** Draws what the assistant asked for under its answer, with Helpful / Not helpful, which lands in the Learning queue. */
export function BlockView({ block, onSend }: { block: Block; onSend: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const title = block.type === 'stage' ? labelOf(block.step) : block.type === 'tool' ? TOOL_TITLE[block.tool] : 'Lifecycle'
  return (
    <div ref={ref} className={styles.blockWrap}>
      <CardBoundary name={block.type === 'stage' ? labelOf(block.step) : block.type === 'tool' ? TOOL_TITLE[block.tool] : 'Lifecycle'}>
        <BlockBody block={block} onSend={onSend} />
      </CardBoundary>
      <div className={styles.rate} data-export-ignore="">
        <span className={styles.sub}>Was this useful?</span>
        <FeedbackWidget targetId={feedbackTarget(block)} />
        <DownloadPng targetRef={ref} name={`${block.projectId ?? 'all'} ${title}`} />
        {block.projectId && <DownloadProject projectId={block.projectId} />}
      </div>
    </div>
  )
}
