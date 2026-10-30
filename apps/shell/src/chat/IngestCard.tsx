import { useEffect, useState } from 'react'
import { ASSISTANT_BASE } from '@pi/config'
import { INGEST_STAGES, INGEST_STAGE_LABEL, type IngestSummary, type ProjectCandidate, type RunView } from '@pi/data'
import { Badge, Button, CircleAlert, ProvenanceChip } from '@pi/ui'
import { StageDetail, StageRail, VectorMap, VectorStrip } from './IngestViz'
import { useIngestRun, type RunPhase } from './useIngestRun'
import styles from './IngestCard.module.css'

interface FindResult { query?: string; candidates?: ProjectCandidate[]; note?: string; error?: string }
const parse = (result: string | undefined): FindResult | null => { try { return result ? JSON.parse(result) as FindResult : null } catch { return null } }
const nf = (n: number) => n.toLocaleString('en-US')

interface EmbeddingConfig { available: boolean; model?: string; dimensions?: number; reason?: string }

/** Whether a run here will embed the chunks, read from the server before the user commits to a run that can take minutes. */
function useEmbeddingConfig(enabled: boolean) {
  const [config, setConfig] = useState<EmbeddingConfig | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch(`${ASSISTANT_BASE}/ingest/config`).then((r) => r.json()).then((b: { embedding: EmbeddingConfig }) => { if (live) setConfig(b.embedding) }).catch(() => undefined)
    return () => { live = false }
  }, [enabled])
  return config
}

/** The status line a screen reader hears: what is running now, with its counter. */
function statusLine(run: RunView, phase: RunPhase): string {
  if (phase === 'done') return 'Ingestion finished.'
  if (phase === 'cancelled') return 'Ingestion cancelled.'
  if (phase === 'failed') return run.error ? `Ingestion failed at ${run.error.stage ? INGEST_STAGE_LABEL[run.error.stage] : 'the start'}: ${run.error.message}` : 'Ingestion failed.'
  const current = INGEST_STAGES.find((s) => run.stages[s].status === 'running')
  if (!current) return 'Starting.'
  const s = run.stages[current]
  return `${INGEST_STAGE_LABEL[current]}${s.total ? `: ${nf(s.done ?? 0)} of ${nf(s.total)}` : ''}`
}

function Summary({ summary, onSend }: { summary: IngestSummary; onSend: (text: string) => void }) {
  const about = `${summary.projectName} (${summary.projectId})`
  const e = summary.embedding
  const c = summary.counts
  return (
    <section className={styles.ready} aria-label="Ready to explore">
      <h4>Ready to explore: {summary.projectName} <span className="mono">{summary.projectId}</span></h4>
      <ul className={styles.counts}>
        <li><strong>{nf(c.contracts)}</strong> contract awards</li>
        <li><strong>{nf(c.documents)}</strong> documents ({nf(c.documents_with_text)} with text)</li>
        <li><strong>{nf(c.chunks)}</strong> chunks</li>
        <li><strong>{nf(c.supervision_reports)}</strong> supervision reports read</li>
      </ul>
      {e?.status === 'done'
        ? <p className={styles.caption}>Embedded {nf(e.vectors ?? 0)} chunks with <span className="mono">{e.model}</span> ({e.dimensions} numbers each){e.reused ? `, ${nf(e.reused)} reused from an earlier run` : ''} · {nf(e.tokens ?? 0)} tokens, about ${(e.costUsd ?? 0).toFixed(4)} · {(summary.durationMs / 1000).toFixed(1)} s in all</p>
        : <p className={styles.caption}><CircleAlert size={13} aria-hidden="true" /> Not embedded: {e?.reason ?? 'no reason given'}. Document search uses keywords only for this project.</p>}
      {summary.sample && <VectorStrip sample={summary.sample} />}
      {summary.map && <VectorMap map={summary.map} />}
      {summary.notes.length > 0 && <details className={styles.notes}><summary>{summary.notes.length} notes on what was and was not ingested</summary><ul>{summary.notes.map((n) => <li key={n}>{n}</li>)}</ul></details>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => onSend(`Show the lifecycle for ${about}`)}>Show lifecycle</Button>
        <Button onClick={() => onSend(`Show the documents for ${about}`)}>Show documents</Button>
        {e?.status === 'done' && <Button onClick={() => onSend(`What lessons or risks do the documents of ${about} record?`)}>Ask about the documents</Button>}
      </div>
    </section>
  )
}

/** The live run of one project: stage rail, what each stage is doing, then the "Ready" summary. */
function RunView_({ projectId, run, phase, problem, lost, onCancel, onRetry, onSend }: { projectId: string; run: RunView; phase: RunPhase; problem: string | null; lost: boolean; onCancel: () => void; onRetry: () => void; onSend: (t: string) => void }) {
  const live = phase === 'starting' || phase === 'running'
  return (
    <div className={styles.run}>
      <StageRail run={run} />
      <p className={styles.status} role="status" aria-live="polite">{statusLine(run, phase)}</p>
      {lost && live && <p className={styles.warn} role="alert">The link to the server dropped; reconnecting. If this stays, the server may have restarted. <Button onClick={onRetry}>Start again</Button></p>}
      {problem && <p className={styles.warn} role="alert">{problem}</p>}
      {INGEST_STAGES.map((s) => <StageDetail key={s} stage={s} run={run} />)}
      {live && <div className={styles.actions}><Button onClick={onCancel}>Cancel</Button></div>}
      {(phase === 'failed' || phase === 'cancelled') && <div className={styles.actions}><Button variant="primary" onClick={onRetry}>{phase === 'cancelled' ? 'Run again' : 'Retry'}</Button><span className={styles.caption}>Pages and documents already read are kept, so a retry continues where it stopped.</span></div>}
      {run.summary && <Summary summary={run.summary} onSend={onSend} />}
      <span hidden>{projectId}</span>
    </div>
  )
}

function Candidate({ c, active, busy, onIngest, onSend, children }: { c: ProjectCandidate; active: boolean; busy: boolean; onIngest: () => void; onSend: (t: string) => void; children: React.ReactNode }) {
  return (
    <li className={`${styles.cand} ${active ? styles.candActive : ''}`}>
      <div className={styles.candHead}>
        <div className={styles.candText}>
          <strong>{c.project_name}</strong>
          <span className={styles.caption}><span className="mono">{c.project_id}</span> · {c.country} · {c.status}{c.approval_date ? ` · approved ${c.approval_date}` : ''}{c.sector ? ` · ${c.sector}` : ''}</span>
        </div>
        {c.stored && <Badge tone="low">Already stored</Badge>}
        {c.stored
          ? <div className={styles.actions}><Button onClick={() => onSend(`Show the lifecycle for ${c.project_name} (${c.project_id})`)}>Show lifecycle</Button>{!active && <Button disabled={busy} onClick={onIngest}>Ingest again</Button>}</div>
          : !active && <Button variant="primary" disabled={busy} onClick={onIngest}>Ingest this project</Button>}
      </div>
      {children}
    </li>
  )
}

/**
 * The card for find_world_bank_project: the projects the public World Bank API matched, each with a button that only the user can press.
 * Pressing it starts the run on the assistant server and the card draws it live. The model never starts a run.
 */
export function IngestCandidates({ result, onSend }: { result: string | undefined; onSend: (text: string) => void }) {
  const found = parse(result)
  const [chosen, setChosen] = useState<string | null>(null)
  const { run, phase, problem, lost, start, cancel } = useIngestRun(chosen)
  const candidates = found?.candidates ?? []
  const embedding = useEmbeddingConfig(candidates.some((c) => !c.stored) || candidates.length > 0)
  if (!found) return null
  if (found.error) return <p role="alert" className={styles.warn}>{found.error}</p>
  if (candidates.length === 0) return <p role="status" className={styles.caption}>{found.note ?? 'No World Bank project matched.'}</p>
  const live = phase === 'starting' || phase === 'running'
  const go = (id: string) => { setChosen(id); void start(id) }
  return (
    <section className={styles.card} aria-label="World Bank projects found">
      <header className={styles.cardHead}>
        <h3>World Bank projects matching “{found.query}”</h3>
        <ProvenanceChip kind="public" detail="World Bank Projects API" />
      </header>
      <ul className={styles.cands}>
        {candidates.map((c) => (
          <Candidate key={c.project_id} c={c} active={chosen === c.project_id && phase !== 'idle'} busy={live} onIngest={() => go(c.project_id)} onSend={onSend}>
            {chosen === c.project_id && phase !== 'idle' && <RunView_ projectId={c.project_id} run={run} phase={phase} problem={problem} lost={lost} onCancel={() => void cancel()} onRetry={() => go(c.project_id)} onSend={onSend} />}
          </Candidate>
        ))}
      </ul>
      <p className={styles.caption}>
        Ingesting reads the project’s contract awards, documents and supervision reports from the public World Bank APIs, splits the document text into chunks{embedding?.available ? ` and embeds them with ${embedding.model} (${embedding.dimensions} numbers per chunk)` : ''}. The first run reads the whole public contract list and can take several minutes; later runs reuse what was read.
        {embedding && !embedding.available && <> <strong>Embedding is off here:</strong> {embedding.reason}.</>}
      </p>
    </section>
  )
}
