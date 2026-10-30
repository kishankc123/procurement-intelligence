import { INGEST_STAGES, INGEST_STAGE_LABEL, type IngestStage, type IngestSummary, type RunView, type StageStatus } from '@pi/data'
import { Check, CircleAlert, X } from '@pi/ui'
import styles from './IngestCard.module.css'

const STATUS_WORD: Record<StageStatus, string> = { pending: 'waiting', running: 'running', done: 'done', skipped: 'skipped', failed: 'failed' }
const nf = (n: number) => n.toLocaleString('en-US')

/** The nine stages as a row of nodes. Status is in words as well as colour, for people who cannot tell the colours apart. */
export function StageRail({ run }: { run: RunView }) {
  return (
    <ol className={styles.rail} aria-label="Ingestion stages">
      {INGEST_STAGES.map((id) => {
        const s = run.stages[id]
        return (
          <li key={id} className={`${styles.node} ${styles[s.status]}`} aria-current={s.status === 'running' ? 'step' : undefined}>
            <span className={styles.dot} aria-hidden="true">{s.status === 'done' ? <Check size={12} /> : s.status === 'failed' ? <X size={12} /> : s.status === 'skipped' ? '–' : null}</span>
            <span className={styles.nodeName}>{INGEST_STAGE_LABEL[id]}</span>
            <span className={styles.nodeState}>{STATUS_WORD[s.status]}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** One cell per contract-list page, filled as the page is read. A long list is drawn with fewer cells, each standing for several pages. */
export function PageGrid({ done, total, found }: { done: number; total: number; found: number }) {
  const MAX = 160
  const per = Math.max(1, Math.ceil(total / MAX))
  const cells = Math.ceil(total / per)
  const filled = Math.floor(done / per)
  return (
    <div>
      <div className={styles.grid} role="img" aria-label={`${nf(done)} of ${nf(total)} pages read, ${nf(found)} contract awards found for this project`}>
        {Array.from({ length: cells }, (_, i) => <span key={i} className={i < filled ? styles.cellOn : (i === filled && done < total ? styles.cellNow : styles.cell)} />)}
      </div>
      <p className={styles.caption}><strong>{nf(done)}</strong> of {nf(total)} pages read{per > 1 ? ` (each square is ${per} pages)` : ''} · <strong>{nf(found)}</strong> contract awards for this project</p>
    </div>
  )
}

function Meter({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className={styles.meter} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span style={{ width: `${pct}%` }} /></div>
      <p className={styles.caption}><strong>{nf(done)}</strong> of {nf(total)}</p>
    </div>
  )
}

const TYPE_COLOR = ['var(--step-planning)', 'var(--step-tender)', 'var(--step-monitoring)', 'var(--step-learning)', 'var(--brand-teal)', 'var(--danger)']
const typeColor = (types: string[], t: string) => TYPE_COLOR[Math.max(0, types.indexOf(t)) % TYPE_COLOR.length]!
const SHORT: Record<string, string> = { 'Implementation Status and Results Report': 'Supervision report', 'Implementation Completion and Results Report': 'Completion report', 'Implementation Completion Report Review': 'Completion review', 'Project Appraisal Document': 'Appraisal', 'Procurement Plan': 'Procurement plan' }
const short = (t: string | undefined) => SHORT[t ?? ''] ?? t ?? 'Document'

/** What each stage shows while it runs and after: the live picture of the data being fetched, parsed and chunked. */
export function StageDetail({ stage, run }: { stage: IngestStage; run: RunView }) {
  const s = run.stages[stage]
  const items = run.items.filter((i) => i.stage === stage)
  // These three have nothing to draw beyond the rail's status; their detail text is in the status line.
  if (s.status === 'pending' || stage === 'find' || stage === 'project' || stage === 'publish') return null
  const head = <p className={styles.detailHead}><span>{INGEST_STAGE_LABEL[stage]}</span>{s.detail && <span className={styles.detailText}>{s.detail}</span>}</p>
  if (stage === 'contracts' && s.total) return <section className={styles.detail}>{head}<PageGrid done={s.done ?? 0} total={s.total} found={s.found ?? 0} /></section>
  if (stage === 'documents' && items.length) {
    return <section className={styles.detail}>{head}<ul className={styles.chips}>{items.map((d) => <li key={d.id}><span className={styles.chip}>{short(d.group)}</span> {d.label}</li>)}</ul></section>
  }
  if (stage === 'texts' && s.total) return <section className={styles.detail}>{head}<Meter done={s.done ?? 0} total={s.total} label="Document texts read" /></section>
  if (stage === 'parse' && items.length) {
    return <section className={styles.detail}>{head}<ul className={styles.rows}>{items.map((r) => <li key={r.id}>{r.ok ? <Check size={14} aria-label="read" /> : <CircleAlert size={14} aria-label="needs a second look" />} {r.label}</li>)}</ul></section>
  }
  if (stage === 'chunk' && items.length) {
    const types = [...new Set(items.map((i) => i.group ?? ''))]
    return (
      <section className={styles.detail}>{head}
        <ul className={styles.rows}>{items.map((d) => (
          <li key={d.id} className={styles.chunkRow}>
            <span className={styles.chunkLabel} title={d.label}>{short(d.group)} · {d.label}</span>
            <span className={styles.chunkBar} role="img" aria-label={`${d.count ?? 0} chunks`}>
              {Array.from({ length: Math.min(d.count ?? 0, 60) }, (_, i) => <span key={i} style={{ background: typeColor(types, d.group ?? '') }} />)}
            </span>
            <span className={styles.chunkCount}>{nf(d.count ?? 0)}</span>
          </li>))}
        </ul>
      </section>
    )
  }
  if (stage === 'embed') {
    if (s.status === 'skipped') return <section className={styles.detail}>{head}</section>
    if (s.status === 'done' && !s.total) return <section className={styles.detail}>{head}<p className={styles.caption}>{nf(s.found ?? 0)} chunks already had vectors from an earlier run, so nothing was sent to the model.</p></section>
    if (s.total !== undefined) return <section className={styles.detail}>{head}<Meter done={s.done ?? 0} total={Math.max(s.total, 1)} label="Embedding batches" /><p className={styles.caption}>{nf(s.found ?? 0)} chunks embedded{s.note ? ` · ${s.note}` : ''}</p></section>
  }
  return <section className={styles.detail}>{head}</section>
}

/** A row of cells, one per number of the start of an embedding: what the model returned for one chunk. */
export function VectorStrip({ sample }: { sample: NonNullable<IngestSummary['sample']> }) {
  const max = Math.max(...sample.values.map(Math.abs), 1e-9)
  return (
    <figure className={styles.figure}>
      <div className={styles.strip} role="img" aria-label={`The first ${sample.values.length} of ${sample.total} numbers of the embedding of chunk ${sample.chunk_id}`}>
        {sample.values.map((v, i) => <span key={i} title={String(v)} style={{ background: v >= 0 ? 'var(--brand-blue)' : 'var(--brand-teal)', opacity: 0.15 + 0.85 * (Math.abs(v) / max) }} />)}
      </div>
      <figcaption className={styles.caption}>First {sample.values.length} of {nf(sample.total)} numbers for <span className="mono">{sample.chunk_id}</span> (blue positive, teal negative, stronger is larger).</figcaption>
    </figure>
  )
}

const MARKS = ['circle', 'square', 'diamond', 'triangle', 'circle', 'square']
/** The chunks as points: nearer points mean closer in meaning. Colour and shape both say which document type a point is from. */
export function VectorMap({ map }: { map: NonNullable<IngestSummary['map']> }) {
  const types = [...new Set(map.map((p) => p.doc_type))]
  const pts = map.length > 1500 ? map.filter((_, i) => i % Math.ceil(map.length / 1500) === 0) : map
  const mark = (t: string, x: number, y: number, key: string) => {
    const c = typeColor(types, t), k = MARKS[Math.max(0, types.indexOf(t)) % MARKS.length]
    if (k === 'square') return <rect key={key} x={x - 0.9} y={y - 0.9} width={1.8} height={1.8} fill={c} fillOpacity={0.75} />
    if (k === 'diamond') return <path key={key} d={`M${x} ${y - 1.2}L${x + 1.2} ${y}L${x} ${y + 1.2}L${x - 1.2} ${y}Z`} fill={c} fillOpacity={0.75} />
    if (k === 'triangle') return <path key={key} d={`M${x} ${y - 1.2}L${x + 1.1} ${y + 0.9}L${x - 1.1} ${y + 0.9}Z`} fill={c} fillOpacity={0.75} />
    return <circle key={key} cx={x} cy={y} r={0.95} fill={c} fillOpacity={0.75} />
  }
  return (
    <figure className={styles.figure}>
      <svg viewBox="0 0 100 62" className={styles.map} role="img" aria-label={`Map of ${map.length} chunks by meaning; nearby points are similar passages`}>
        <rect x="0.5" y="0.5" width="99" height="61" fill="none" stroke="var(--border)" />
        {pts.map((p) => mark(p.doc_type, 3 + p.x * 94, 3 + p.y * 56, p.chunk_id))}
      </svg>
      <figcaption className={styles.legend}>
        {types.map((t) => <span key={t}><svg viewBox="-2 -2 4 4" width="12" height="12" aria-hidden="true">{mark(t, 0, 0, 'k')}</svg>{short(t)}</span>)}
        <span className={styles.caption}>Positions come from a two-direction projection of the vectors; the axes have no units.</span>
      </figcaption>
    </figure>
  )
}
