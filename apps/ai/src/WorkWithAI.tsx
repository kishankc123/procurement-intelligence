import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { can, whyDisabled } from '@pi/config'
import {
  SPEC_STATUS_LABEL, checkReachable, checkRetender, countryReference, specificationChecks, useCountryYears, useTenderDraft, checkSourceUrl, classifySource, ingestionSteps, groupLinksByRecord, linkRecords, tenderCandidates,
  useAddSourceLink, useAllPlans, useTenderHistory, useChunks, useContracts, useCurrentUser, useDocs, useIngestionRuns, useProject, useRecordIngestionRun,
  useProjects, useReports, useSourceLinks, useUiStore, type Citation, type RetenderMatch, type TenderStatus, type UrlCheck,
} from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip, Select, TableScroll, Paged } from '@pi/ui'
import { CitationChip, DocumentDialog, FeedbackWidget, SourceDrawer } from '@pi/domain'
import styles from './WorkWithAI.module.css'

const STEP_LABEL = { done: 'Done', failed: 'Failed', skipped: 'Skipped', planned: 'Planned' } as const
const TENDER_STATUS: Record<TenderStatus, { label: string; tone: 'high' | 'medium' | 'low' | 'neutral' }> = {
  planned: { label: 'Planned', tone: 'neutral' }, awarded: { label: 'Awarded', tone: 'low' }, cancelled: { label: 'Cancelled', tone: 'high' }, re_tendered: { label: 'Re-tendered', tone: 'medium' },
}
const VERDICT_TONE = { ok: 'low', attention: 'medium', info: 'neutral' } as const
const STEP_TONE = { done: 'low', failed: 'high', skipped: 'neutral', planned: 'medium' } as const

/** Every layer ends with the same question, so reviewers can say whether its output helped. Feeds the Learning queue. */
function LayerFeedback({ layer, projectId }: { layer: string; projectId: string }) {
  return (
    <div className={styles.feedback}>
      <span>Was this layer's output useful?</span>
      <FeedbackWidget targetId={`AI-LAYER-${layer}-${projectId}`} />
    </div>
  )
}

/**
 * The earlier tenders that look like the one checked, one at a time: the box shows a single match and scrolls (or snaps) to the next.
 * The box scrolls, not the page or the table, and a counter says which one is showing.
 */
function MatchList({ matches, onOpen }: { matches: RetenderMatch[]; onOpen: (c: Citation) => void }) {
  const [shown, setShown] = useState(0)
  const many = matches.length > 1
  return (
    <div className={styles.matches}>
      <ul
        className={styles.matchBox}
        role="region" tabIndex={0} aria-label={many ? `Earlier tenders that look like it, ${matches.length} found. Scroll for the next.` : 'Earlier tender that looks like it'}
        onScroll={(e) => setShown(Math.round(e.currentTarget.scrollTop / Math.max(e.currentTarget.clientHeight, 1)))}
      >
        {matches.map((m) => (
          <li key={m.candidate.id} className={styles.matchItem}>
            <div className={styles.row}>
              <strong>{m.candidate.name}</strong> <span className="mono">{m.candidate.id}</span>
              <Badge tone={TENDER_STATUS[m.candidate.status].tone}>{TENDER_STATUS[m.candidate.status].label}</Badge>
              <span className={styles.sub}>{m.candidate.project_id}{m.candidate.date ? ` · ${m.candidate.date}` : ''}</span>
            </div>
            <p>{m.why} <ProvenanceChip kind="derived" /></p>
            {m.candidate.reason && <p className={styles.sub}>Reason: {m.candidate.reason}</p>}
            {m.candidate.citation && <div className={styles.row}><CitationChip citation={m.candidate.citation} onOpen={onOpen} /></div>}
          </li>
        ))}
      </ul>
      {many && <span className={styles.sub} role="status">Match {Math.min(shown + 1, matches.length)} of {matches.length}. Scroll inside the box for the next one.</span>}
    </div>
  )
}

function Layer({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card title={`${n} · ${title}`} aside={aside}>
      <div className={styles.layer}>{children}</div>
    </Card>
  )
}

function Features({ onChangeProject }: { onChangeProject: () => void }) {
  const projectId = useUiStore((s) => s.projectId)
  const { role } = useCurrentUser()
  const project = useProject(projectId).data?.[0]
  const links = useSourceLinks(projectId).data ?? []
  const runs = useIngestionRuns(projectId).data ?? []
  const contracts = useContracts(projectId).data ?? []
  const reports = useReports(projectId).data ?? []
  const docs = useDocs().data ?? []
  const chunks = useChunks().data ?? []
  const history = useTenderHistory().data ?? []
  const allPlans = useAllPlans().data ?? []
  const draft = useTenderDraft(projectId).data?.[0]
  const years = useCountryYears(project?.borrower_country_code ?? '').data ?? []
  const addLink = useAddSourceLink()
  const recordRun = useRecordIngestionRun()

  const [raw, setRaw] = useState('')
  const [check, setCheck] = useState<UrlCheck | null>(null)
  const [reach, setReach] = useState<'idle' | 'checking' | 'reachable' | 'unreachable'>('idle')
  const [pickedLink, setPickedLink] = useState('')
  const [open, setOpen] = useState<Citation | null>(null)
  const [tenderQuery, setTenderQuery] = useState('')

  if (!project) return <Card state="loading">{null}</Card>

  const canAdd = can(role, 'add_source_link')
  const canRun = can(role, 'run_ingestion')
  const linkId = pickedLink || links[0]?.id || ''
  const link = links.find((l) => l.id === linkId)
  const [docOpen, setDocOpen] = useState<string | null>(null)
  const lastRun = [...runs].filter((r) => r.link_id === linkId).sort((a, b) => a.ran_at.localeCompare(b.ran_at)).at(-1)
  const candidates = tenderCandidates(history, allPlans)
  const projectPlans = allPlans.filter((p) => p.project_id === projectId)
  const typed = tenderQuery.trim() ? checkRetender(tenderQuery, candidates) : null
  const linked = linkRecords({ project, contracts, reports, docs, chunks })

  const onCheck = async () => {
    const result = checkSourceUrl(raw)
    setCheck(result)
    setReach('idle')
    if (!result.ok || !result.url) return
    setReach('checking')
    setReach(await checkReachable(result.url))
  }
  const onSave = () => {
    if (!check?.ok || !check.url || !check.host || (reach !== 'reachable' && reach !== 'unreachable')) return
    const known = classifySource(check.host)
    addLink.mutate(
  const groups = groupLinksByRecord(linked)
      { project_id: projectId, url: check.url, host: check.host, reachability: reach, publisher: known?.publisher ?? null, kind: known?.kind ?? null },
      { onSuccess: () => { setRaw(''); setCheck(null); setReach('idle') } },
    )
  }

  return (
    <div className={styles.page}>
      <div>
        <div className={styles.row}>
          <h1>Work with AI</h1>
          <Button onClick={onChangeProject}>Change project</Button>
        </div>
        <p className={styles.sub}>
          <span className="mono">{project.project_id}</span> · {project.project_name}. Connect a public source, run ingestion and see how structured records and document text line up.
          Runs are <Badge>Simulated</Badge>: nothing is downloaded or read, and every step says what it did.
        </p>
      </div>

      <Layer n={1} title="Connect a source link" aside={<ProvenanceChip kind="entered" />}>
        <label className={styles.field}>Public web address of a report, dataset or tender page
          <input type="url" inputMode="url" placeholder="https://documents.worldbank.org/…" value={raw} onChange={(e) => { setRaw(e.target.value); setCheck(null); setReach('idle') }} disabled={!canAdd} />
        </label>
        <div className={styles.row}>
          <Button variant="primary" onClick={onCheck} disabled={!raw.trim() || reach === 'checking'} disabledReason={canAdd ? undefined : whyDisabled('add_source_link')}>
            {reach === 'checking' ? 'Checking…' : 'Check link'}
          </Button>
          <Button variant="success" onClick={onSave} disabled={!check?.ok || (reach !== 'reachable' && reach !== 'unreachable') || addLink.isPending} disabledReason={canAdd ? undefined : whyDisabled('add_source_link')}>
            Save to project
          </Button>
        </div>
        {check && (
          <div className={styles.result} role="status">
            <div className={styles.row}>
              <strong>Type check:</strong>{' '}
              {check.ok ? <Badge tone="low">Valid link</Badge> : <Badge tone="high">Not accepted</Badge>}
            </div>
            {check.problems.map((p) => <p key={p} className={styles.problem}>{p}</p>)}
            {check.warnings.map((w) => <p key={w} className={styles.warn}>{w}</p>)}
            {check.ok && check.host && (
              <>
                <div className={styles.row}>
                  <strong>Server:</strong>{' '}
                  {reach === 'checking' && <span>Checking…</span>}
                  {reach === 'reachable' && <Badge tone="low">Reachable</Badge>}
                  {reach === 'unreachable' && <Badge tone="high">Not reachable</Badge>}
                </div>
                <p className={styles.sub}>Reachable means a server answered. The browser cannot read its status or content, so a page that answers with an error still shows as reachable.</p>
                <div className={styles.row}>
                  <strong>Publisher:</strong>{' '}
                  {classifySource(check.host) ? <span>{classifySource(check.host)?.publisher}: {classifySource(check.host)?.kind}</span> : <ProvenanceChip kind="missing" detail="not a known publisher" />}
                </div>
              </>
            )}
          </div>
        )}
        {links.length === 0 ? (
          <EmptyState title="No source links on this project yet" text="Paste a link above, check it, then save it to the project." />
        ) : (
          <Paged items={links} label="source links">{(pageRows) =>
            <table className={styles.table}>
              <thead><tr><th>Link</th><th>Publisher</th><th>Server</th><th>Checked</th><th>Added by</th></tr></thead>
              <tbody>
                {pageRows.map((l) => (
                  <tr key={l.id}>
                    <td className={`${styles.url} mono`}>{l.url}</td>
                    <td>{l.publisher ? `${l.publisher}: ${l.kind}` : <ProvenanceChip kind="missing" detail="unclassified" />}</td>
                    <td>{l.reachability === 'reachable' ? <Badge tone="low">Reachable</Badge> : <Badge tone="high">Not reachable</Badge>}</td>
                    <td className="mono">{l.checked_at.slice(0, 16).replace('T', ' ')}</td>
                    <td>{l.added_by_role.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
          </Paged>
        )}
        <LayerFeedback layer="link" projectId={projectId} />
      </Layer>

      <Layer n={2} title="Run ingestion" aside={<Badge>Simulated</Badge>}>
        {links.length === 0 ? (
          <EmptyState title="Nothing to ingest" text="Save a source link in layer 1 first." />
        ) : (
          <>
            <div className={styles.row}>
              <div style={{ minWidth: 260, flex: 1 }}>
                <Select aria-label="Source link to ingest" value={linkId} onValueChange={setPickedLink} options={links.map((l) => ({ value: l.id, label: `${l.host} · ${l.id}` }))} />
              </div>
              <Button variant="primary" disabled={!link || recordRun.isPending} disabledReason={canRun ? undefined : whyDisabled('run_ingestion')}
                onClick={() => link && recordRun.mutate({ project_id: projectId, link_id: link.id, steps: ingestionSteps(link) })}>
                Run ingestion
              </Button>
            </div>
            {lastRun ? (
              <div>
                <p className={styles.sub}>Last run <span className="mono">{lastRun.ran_at.slice(0, 19).replace('T', ' ')}</span> · {lastRun.id}</p>
                {lastRun.steps.map((s) => (
                  <div key={s.id} className={styles.step}>
                    <Badge tone={STEP_TONE[s.status]}>{STEP_LABEL[s.status]}</Badge>
                    <div><strong>{s.label}</strong><p className={styles.sub}>{s.detail}</p></div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Not run yet for this link" text="Run ingestion to see each step and what it did." />}
          </>
        )}
        <LayerFeedback layer="ingestion" projectId={projectId} />
      </Layer>

      <Layer n={3} title="Link structured records to document text" aside={<ProvenanceChip kind="derived" detail={`n=${linked.length}`} />}>
        <p className={styles.sub}>
          Contracts and supervision reports are structured. Document chunks are free text. A pair is linked when a rule connects them: the text names a contract reference,
          or a report and a document share this project and the same date, or the text names the project.
        </p>
        {linked.length === 0 ? (
          <EmptyState title="No links found for this project" text="No document text names this project's contracts, and no document matches a report date." />
        ) : (
          <Paged items={groups} label="structured records" maxHeight="520px">{(pageRows) =>
            <table className={styles.table}>
              <thead><tr><th>Structured record</th><th aria-label="Link" /><th>Document text</th><th>Why they are linked</th></tr></thead>
              {pageRows.map((g) => (
                <tbody key={g.key} className={styles.group}>
                  {g.links.map((l, i) => (
                    <tr key={l.id}>
                      {i === 0 && (
                        <td rowSpan={g.links.length} className={styles.node}>
                          <CitationChip citation={{ ref_type: 'record', ref_id: g.structured.id, label: g.structured.label }} onOpen={setOpen} />{' '}
                          <ProvenanceChip kind="public" />
                          <p className={styles.snippet}>{g.links.length} document {g.links.length === 1 ? 'text' : 'texts'} linked</p>
                        </td>
                      )}
                      <td className={`${styles.branch} ${g.links.length === 1 ? styles.only : i === 0 ? styles.first : i === g.links.length - 1 ? styles.last : styles.mid}`} aria-hidden="true">
                        <span className={styles.arrow} />
                      </td>
                      <td>
                        <CitationChip citation={{ ref_type: 'chunk', ref_id: l.chunk.chunk_id, label: `${l.doc?.title ?? l.chunk.doc_id} · p.${l.chunk.page}` }} onOpen={setOpen} />
                        {l.doc && <button type="button" className={styles.docLink} onClick={() => setDocOpen(l.doc?.doc_id ?? null)}>Open document</button>}
                        <p className={styles.snippet}>{l.chunk.text.length > 140 ? `${l.chunk.text.slice(0, 140)}…` : l.chunk.text}</p>
                      </td>
                      <td>{l.why} <ProvenanceChip kind="derived" /></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>}
          </Paged>
        )}
        <LayerFeedback layer="records" projectId={projectId} />
      </Layer>

      <Layer n={4} title="Check for a retender" aside={<ProvenanceChip kind="derived" detail={`${candidates.length} tenders on record`} />}>
        <p className={styles.sub}>
          Before a tender goes out, check its id or name against the tenders on record (earlier tenders from every project, and the plans not yet advertised).
          It finds the same id, the same or a similar name, and the same name with another lot number, and shows why an earlier one was cancelled.
        </p>
        <label className={styles.field}>Tender id, contract reference or name
          <input type="text" placeholder="e.g. Road safety signage supply, or TND-MOCK-003" value={tenderQuery} onChange={(e) => setTenderQuery(e.target.value)} />
        </label>
        {typed ? (
          <div role="status" className={styles.layer}>
        <DocumentDialog docId={docOpen} onClose={() => setDocOpen(null)} />
            <div className={styles.result}>
              <div className={styles.row}><Badge tone={VERDICT_TONE[typed.verdict.tone]}>{typed.verdict.tone === 'ok' ? 'No match' : typed.verdict.tone === 'attention' ? 'Check before issuing' : 'Note'}</Badge> <span className={styles.sub}>{typed.compared} tenders compared</span></div>
              <p>{typed.verdict.text}</p>
            </div>
            {typed.matches.length > 0 && <MatchList matches={typed.matches} onOpen={setOpen} />}
          </div>
        ) : <p className={styles.sub}>Type above to check one tender. Your plans for this project are checked below.</p>}
        <h3>Your plans for this project</h3>
        {projectPlans.length === 0 ? <EmptyState title="No plans on this project" text="Add a plan in Planning to check it here." /> : (
          <TableScroll>
            <table className={styles.table}>
              <thead><tr><th>Plan</th><th>Result</th><th>Earlier tenders that look like it</th></tr></thead>
              <tbody>
                {projectPlans.map((p) => {
                  const r = checkRetender(p.name, candidates, { excludeIds: [p.id] })
                  return (
                    <tr key={p.id}>
                      <td>{p.name}<br /><span className="mono">{p.id}</span></td>
                      <td><Badge tone={VERDICT_TONE[r.verdict.tone]}>{r.verdict.tone === 'ok' ? 'No match' : r.verdict.tone === 'attention' ? 'Check before issuing' : 'Note'}</Badge><p className={styles.sub}>{r.verdict.text}</p></td>
                      <td>{r.matches.length > 0 ? <MatchList matches={r.matches} onOpen={setOpen} /> : <ProvenanceChip kind="missing" detail="none on record" />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
        <LayerFeedback layer="retender" projectId={projectId} />
      </Layer>

      <Layer n={5} title="Check the tender specification" aside={<ProvenanceChip kind="derived" />}>
        <p className={styles.sub}>
          Rules over the saved tender draft: bid validity against the plan, performance security, evaluation method and period, contract end against project closing,
          qualification value, and earlier cancelled tenders. Each plan is checked on its own; open Tender design to edit the draft and see every rule.
        </p>
        {!draft ? <EmptyState title="No tender draft for this project" text="Save a draft in Tender design first." action={<Link to="/tender-design">Open Tender design</Link>} /> : projectPlans.length === 0 ? (
          <EmptyState title="No plans on this project" text="Add a plan in Planning to check the draft against it." />
        ) : (
          <TableScroll>
            <table className={styles.table}>
              <thead><tr><th>Plan</th><th>Pass</th><th>To check</th><th>Fail</th><th>Cannot check</th><th>First issue</th></tr></thead>
              <tbody>
                {projectPlans.map((p) => {
                  const checks = specificationChecks({ draft, plan: p, project, contracts, candidates, docs, chunks, evaluationReference: countryReference(years, project.borrower_country_code, 'C5.2') })
                  const n = (st: string) => checks.filter((c) => c.status === st).length
                  const first = checks.find((c) => c.status === 'fail') ?? checks.find((c) => c.status === 'warn')
                  return (
                    <tr key={p.id}>
                      <td>{p.name}<br /><span className="mono">{p.id}</span></td>
                      <td className="mono">{n('pass')}</td><td className="mono">{n('warn')}</td><td className="mono">{n('fail')}</td><td className="mono">{n('not_checkable')}</td>
                      <td>{first ? <><Badge tone={first.status === 'fail' ? 'high' : 'medium'}>{SPEC_STATUS_LABEL[first.status]}</Badge> <strong>{first.clause}</strong>: {first.detail}</> : <span className={styles.sub}>None</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
        <div className={styles.row}><Link to="/tender-design">Open Tender design</Link></div>
        <LayerFeedback layer="spec" projectId={projectId} />
      </Layer>

      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** First screen: pick the project to work on. Picking it sets the shared project, so every layer below uses that context. */
function ProjectPicker({ onPicked }: { onPicked: () => void }) {
  const { projectId, setProject } = useUiStore()
  const projects = useProjects()
  const pick = (id: string) => { setProject(id); onPicked() }

  return (
    <div className={styles.page}>
      <div>
        <h1>Work with AI</h1>
        <p className={styles.sub}>Choose the project to work on. Connecting a source, running ingestion, linking records and the checks all use the project you pick.</p>
      </div>
      <Card title="Projects" aside={<ProvenanceChip kind="public" />} state={projects.isLoading ? 'loading' : projects.isError ? 'error' : 'ready'}>
        {(projects.data ?? []).length === 0 ? (
          <EmptyState title="No projects found" text="Add a project to mock/db.json and run pnpm reset-db." />
        ) : (
          <TableScroll>
            <table className={styles.table}>
              <thead><tr><th>Project</th><th>Country</th><th>Sector</th><th /></tr></thead>
              <tbody>
                {(projects.data ?? []).map((p) => (
                  <tr key={p.project_id}>
                    <td>{p.project_name}<br /><span className="mono">{p.project_id}</span>{p.project_id === projectId && <> <Badge>Current</Badge></>}</td>
                    <td>{p.borrower_country}</td>
                    <td>{p.project_global_practice}</td>
                    <td><Button variant="primary" onClick={() => pick(p.project_id)} aria-label={`Work with AI on ${p.project_name}`}>Select</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  )
}

/** The page starts at the project list every time it opens, then shows the AI layers for the chosen project. */
export default function WorkWithAI() {
  const [picked, setPicked] = useState(false)
  return picked ? <Features onChangeProject={() => setPicked(false)} /> : <ProjectPicker onPicked={() => setPicked(true)} />
}
