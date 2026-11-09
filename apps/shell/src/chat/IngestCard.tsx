import { useEffect, useId, useRef, useState } from 'react'
import { ASSISTANT_BASE } from '@pi/config'
import { INGEST_STAGES, INGEST_STAGE_LABEL, useProjects, useUiStore, type IngestSummary, type ProjectCandidate, type RunView } from '@pi/data'
import { Badge, Button, CircleAlert, CircleCheck, Info, ProvenanceChip } from '@pi/ui'
import { notify } from '../toasts'
import { StageDetail, StageRail, VectorMap, VectorStrip } from './IngestViz'
import { fetchConfig, type IngestConfig } from './ingestClient'
import { markIdle, markIngesting, useBusyIngest } from './ingestBusy'
import { useIngestRun, type RunPhase } from './useIngestRun'
import styles from './IngestCard.module.css'

interface FindResult { query?: string; candidates?: ProjectCandidate[]; note?: string; error?: string }
const parse = (result: string | undefined): FindResult | null => { try { return result ? JSON.parse(result) as FindResult : null } catch { return null } }
const nf = (n: number) => n.toLocaleString('en-US')

/** What a run can do on this server, read before the user commits to a run that can take minutes. Null while loading or when the server is not reachable. */
function useIngestConfig(enabled: boolean) {
  const [config, setConfig] = useState<IngestConfig | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    void fetchConfig(ASSISTANT_BASE).then((c) => { if (live) setConfig(c) })
    return () => { live = false }
  }, [enabled])
  return config
}

/** Asked for when the hosted site needs its ingest token. The token stays in this tab and is sent only to the ingest endpoints. */
function TokenPrompt({ projectId, message, onSubmit }: { projectId: string; message: string | null; onSubmit: (token: string, id: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form className={styles.warn} onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value, projectId) }}>
      <label htmlFor={`tok-${projectId}`}>{message ?? 'Ingest token'}</label>
      <input id={`tok-${projectId}`} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className={styles.token} />
      <Button variant="primary" type="submit" disabled={!value.trim()}>Use token and ingest</Button>
    </form>
  )
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
        {c.tender_notices !== undefined && <li><strong>{nf(c.tender_notices)}</strong> tenders</li>}
        {c.plan_packages !== undefined && <li><strong>{nf(c.plan_packages)}</strong> plan package rows</li>}
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
        <Button onClick={() => onSend(`Show the planning for ${about}`)}>Show planning</Button>
        <Button onClick={() => onSend(`Show the tenders for ${about}`)}>Show tenders</Button>
        {e?.status === 'done' && <Button onClick={() => onSend(`What lessons or risks do the documents of ${about} record?`)}>Ask about the documents</Button>}
      </div>
    </section>
  )
}

/** The live run of one project: stage rail, what each stage is doing, then the "Ready" summary. */
function RunView_({ projectId, run, phase, problem, lost, onCancel, onRetry, onSend, actions = true }: { projectId: string; run: RunView; phase: RunPhase; problem: string | null; lost: boolean; onCancel: () => void; onRetry: () => void; onSend: (t: string) => void; /** False inside the collapsed details, where the card itself offers Retry. */ actions?: boolean }) {
  const live = phase === 'starting' || phase === 'running'
  return (
    <div className={styles.run}>
      <StageRail run={run} />
      <p className={styles.status} role="status" aria-live="polite">{statusLine(run, phase)}</p>
      {lost && live && <p className={styles.warn} role="alert">The link to the server dropped; reconnecting. If this stays, the server may have restarted. <Button onClick={onRetry}>Start again</Button></p>}
      {problem && <p className={styles.warn} role="alert">{problem}</p>}
      {INGEST_STAGES.map((s) => <StageDetail key={s} stage={s} run={run} />)}
      {actions && live && <div className={styles.actions}><Button onClick={onCancel}>Cancel</Button></div>}
      {actions && (phase === 'failed' || phase === 'cancelled') && <div className={styles.actions}><Button variant="primary" onClick={onRetry}>{phase === 'cancelled' ? 'Run again' : 'Retry'}</Button><span className={styles.caption}>Pages and documents already read are kept, so a retry continues where it stopped.</span></div>}
      {run.summary && <Summary summary={run.summary} onSend={onSend} />}
      <span hidden>{projectId}</span>
    </div>
  )
}

/** What is on screen while a project is being ingested: one line of loading text. The stages are not drawn; they are in "Details of this ingestion" once it has finished. */
function Ingesting({ name, lost, onCancel, onRetry }: { name: string; lost: boolean; onCancel: () => void; onRetry: () => void }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.loadingText}>Ingesting <strong>{name}</strong><span className={styles.dots} aria-hidden="true"><i>.</i><i>.</i><i>.</i></span> This can take a few minutes.</span>
      <Button onClick={onCancel}>Cancel</Button>
      {lost && <span className={styles.warn} role="alert">The link to the server dropped; reconnecting. <Button onClick={onRetry}>Start again</Button></span>}
    </div>
  )
}

/**
 * The card for find_world_bank_project. It says first that a project that is not in the app has to be ingested (its record, contracts, documents, tenders
 * and plan), and each such project has a Proceed button that only the user can press. While it runs the card shows one line of loading text; when it
 * is done a small alert says the project's details are available, and the project becomes the one the conversation is about. The model never starts a run.
 */
export function IngestCandidates({ result, onSend }: { result: string | undefined; onSend: (text: string) => void }) {
  const found = parse(result)
  const [chosen, setChosen] = useState<string | null>(null)
  const { run, phase, problem, lost, needsToken, start, submitToken, cancel } = useIngestRun(chosen)
  const candidates = found?.candidates ?? []
  const owner = useId()
  const busy = useBusyIngest()
  const config = useIngestConfig(candidates.length > 0)
  const known = useProjects().data
  const setChatProject = useUiStore((st) => st.setChatProject)
  const blocked = config?.mode === 'steps' && config.enabled === false ? (config.reason ?? 'Live ingestion is not switched on for this site.') : undefined
  const nameOf = (id: string | null) => candidates.find((c) => c.project_id === id)?.project_name ?? id ?? ''

  // One ingestion at a time, across every card in the chat: while this card's run is going it holds the slot, and all other Proceed buttons are off.
  const running_ = phase === 'starting' || phase === 'running'
  useEffect(() => {
    if (chosen && running_) markIngesting(owner, chosen, nameOf(chosen))
    else markIdle(owner)
  }, [chosen, running_]) // eslint-disable-line react-hooks/exhaustive-deps -- nameOf only reads candidates
  useEffect(() => () => markIdle(owner), [owner])

  // Tell the user once when the run they started has finished or failed, wherever they have scrolled to.
  const told = useRef('')
  useEffect(() => {
    if (!chosen || (phase !== 'done' && phase !== 'failed')) return
    const key = `${chosen}:${phase}`
    if (told.current === key) return
    told.current = key
    if (phase === 'done') {
      notify({ tone: 'success', title: `${nameOf(chosen)} is ready`, text: 'Its project details, contracts, documents, tenders and plan are now available. Ask me about it.' })
      setChatProject(chosen)
    } else notify({ tone: 'error', title: `${nameOf(chosen)} could not be ingested`, text: problem ?? run.error?.message ?? 'Open the card for the reason.' })
  }, [phase, chosen]) // eslint-disable-line react-hooks/exhaustive-deps -- once per outcome

  if (!found) return null
  if (found.error) return <p role="alert" className={styles.warn}>{found.error}</p>
  if (candidates.length === 0) return <p role="status" className={styles.caption}>{found.note ?? 'No World Bank project matched.'}</p>
  const live = phase === 'starting' || phase === 'running'
  const go = (id: string) => { setChosen(id); void start(id) }
  const available = (c: ProjectCandidate) => c.stored || (known ?? []).some((p) => p.project_id === c.project_id)
  // A project that has just been ingested no longer needs the explanation.
  const missing = candidates.filter((c) => !available(c) && !(chosen === c.project_id && phase === 'done'))
  return (
    <section className={styles.card} aria-label="World Bank projects found">
      <header className={styles.cardHead}>
        <h3>World Bank projects matching “{found.query}”</h3>
        <ProvenanceChip kind="public" detail="World Bank Projects API" />
      </header>
      {missing.length > 0 && (
        <p className={styles.notice}>
          <Info size={16} aria-hidden="true" />
          <span>
            {missing.length === 1 ? 'This project is not in the app yet.' : 'These projects are not in the app yet.'} Before I can answer questions about {missing.length === 1 ? 'it' : 'one of them'}, I need to ingest it:
            its project record, contracts, documents (supervision reports, the final report and the procurement plan), tenders and plan. This takes a few minutes. Choose <strong>Proceed</strong> to start, and I will tell you when it is ready.
          </span>
        </p>
      )}
      <ul className={styles.cands}>
        {candidates.map((c) => {
          const mine = chosen === c.project_id
          const running = mine && live
          const done = mine && phase === 'done'
          const failed = mine && (phase === 'failed' || phase === 'cancelled')
          // Just ingested counts as available at once; the project list catches up a moment later.
          const here = available(c) || done
          return (
            <li key={c.project_id} className={styles.cand}>
              <div className={styles.candHead}>
                <div className={styles.candText}>
                  <strong>{c.project_name}</strong>
                  <span className={styles.caption}><span className="mono">{c.project_id}</span> · {c.country} · {c.status}{c.approval_date ? ` · approved ${c.approval_date}` : ''}{c.sector ? ` · ${c.sector}` : ''}</span>
                </div>
                {here && <Badge tone="low">Available</Badge>}
                {here && !running && <Button onClick={() => onSend(`Show the lifecycle for ${c.project_name} (${c.project_id})`)}>Show details</Button>}
                {!here && !running && !needsToken && <Button variant="primary" disabled={live} disabledReason={blocked ?? (busy ? `Wait for ${busy.name} to finish ingesting. One project at a time.` : undefined)} onClick={() => go(c.project_id)}>{failed ? 'Try again' : 'Proceed'}</Button>}
              </div>
              {running && <Ingesting name={c.project_name} lost={lost} onCancel={() => void cancel()} onRetry={() => go(c.project_id)} />}
              {mine && needsToken && <TokenPrompt projectId={c.project_id} message={problem} onSubmit={(t, id) => { setChosen(id); void submitToken(t, id) }} />}
              {done && <p className={styles.readyLine} role="status"><CircleCheck size={16} aria-hidden="true" /> <span><strong>{c.project_name}</strong> is ready. Its project details, contracts, documents, tenders and plan are available now.</span></p>}
              {failed && <p className={styles.warn} role="alert">{problem ?? run.error?.message ?? 'The ingestion did not finish.'} What was already read is kept, so trying again continues from there.</p>}
              {mine && (done || failed) && (
                <details className={styles.more}>
                  <summary>Details of this ingestion</summary>
                  <RunView_ projectId={c.project_id} run={run} phase={phase} problem={null} lost={false} actions={false} onCancel={() => undefined} onRetry={() => go(c.project_id)} onSend={onSend} />
                </details>
              )}
            </li>
          )
        })}
      </ul>
      {blocked && <p role="status" className={styles.warn}><CircleAlert size={14} aria-hidden="true" /> Live ingestion is not available on this site: {blocked}</p>}
      {config && !config.embedding.available && missing.length > 0 && <p className={styles.caption}>Searching the documents by meaning is off here: {config.embedding.reason}. Keyword search still works.</p>}
    </section>
  )
}
