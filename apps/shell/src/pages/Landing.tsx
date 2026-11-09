import { Link } from 'react-router'
import { LIFECYCLE_STEPS } from '@pi/config'
import { projectScope, useAllContracts, useDocs, useProjects } from '@pi/data'
import { Sparkles } from '@pi/ui'
import { WorldBackdrop } from '@pi/domain'
import { STEP_COLOR } from '../stepColors'
import styles from './Landing.module.css'

/** The three kinds of public information the assistant joins up, and what each one answers. */
const LAYERS = [
  { title: 'What happened', kind: 'Structured data', text: 'Contract awards, suppliers, amounts, procurement methods, dates and disbursement.' },
  { title: 'How it was done', kind: 'Operational documents', text: 'Supervision reports, procurement arrangements and notices that describe how the work was run.' },
  { title: 'Why it worked, or did not', kind: 'Evaluation knowledge', text: 'Completion reports and lessons learned, kept in documents that are hard to search.' },
] as const

/**
 * The landing page: what ProcureIntel is, in a paragraph and three small visuals, with the two ways in (the top bar links to Learn about the assistant and
 * Get started). The figures are counted from the stored real World Bank records, never typed here.
 */
export function Landing() {
  const projects = useProjects().data
  const contracts = useAllContracts().data
  const docs = useDocs().data
  const real = new Set((projects ?? []).filter((p) => projectScope(p.project_id) === 'real').map((p) => p.project_id))
  const counts = projects && contracts && docs
    ? [
      { label: 'projects', n: real.size },
      { label: 'contract awards', n: contracts.filter((c) => real.has(c.project_id)).length },
      { label: 'documents', n: docs.filter((d) => real.has(d.project_id)).length },
    ]
    : null
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <WorldBackdrop />
        <p className={styles.eyebrow}>Procurement intelligence</p>
        <h1 id="landing-title" className={styles.wordmark}>Procure<span>Intel</span></h1>
        <p className={styles.lead}>
          ProcureIntel brings together what the World Bank publishes about a project: the contracts that were awarded, the reports that describe how the work was run, and the
          lessons written when it ended. Ask the assistant about a project, or about your own procurement, and it answers with a plan, tender clauses, early-warning signals or
          supplier history, each with the record it came from. Where the public data says nothing, it says so instead of guessing.
        </p>
        <div className={styles.actions}>
          <Link to="/chat" className={styles.primary}><Sparkles size={16} aria-hidden="true" />Get started with ProcureIntel</Link>
          <Link to="/assistant" className={styles.secondary}>Learn about the assistant</Link>
        </div>
        {counts && (
          <ul className={styles.counts} aria-label="What is stored">
            {counts.map((c) => <li key={c.label}><strong>{c.n.toLocaleString('en-US')}</strong> {c.label}</li>)}
          </ul>
        )}
        {counts && <p className={styles.note}>Counted from the stored real World Bank records. Mock projects are separate and labelled.</p>}
      </section>

      <section aria-labelledby="layers-title" className={styles.section}>
        <h2 id="layers-title">Three kinds of information, one traceable record</h2>
        <ul className={styles.layers}>
          {LAYERS.map((l, i) => (
            <li key={l.title}>
              <span className={styles.num} aria-hidden="true">{i + 1}</span>
              <span className={styles.layerKind}>{l.kind}</span>
              <strong>{l.title}</strong>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title" className={styles.section}>
        <h2 id="steps-title">Support from planning to learning</h2>
        <ol className={styles.steps}>
          {LIFECYCLE_STEPS.map((s) => (
            <li key={s.id} style={{ borderTopColor: STEP_COLOR[s.id] }}>
              <strong>{s.label}</strong>
              <span>{s.summary}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
