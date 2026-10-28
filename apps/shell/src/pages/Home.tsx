import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LIFECYCLE_STEPS, PLATFORM_AREAS } from '@pi/config'
import { useFeedback, usePlan, useProjects, useReports, useTenderDraft, useUiStore } from '@pi/data'
import { Card, DonutNav, EmptyState, ProvenanceChip, WheelPicker, type Provenance, TableScroll } from '@pi/ui'
import { STEP_COLOR } from '../stepColors'
import styles from './Home.module.css'

interface Fact { text: string; kind: Provenance }

export function Home() {
  const navigate = useNavigate()
  const { projectId, setProject } = useUiStore()
  const projects = useProjects()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  // The global project filter is the single source of truth: the wheel, the table, the menus and the filter rail all move it.
  const selected = projects.data?.find((p) => p.project_id === projectId) ?? projects.data?.[0] ?? null
  const selectedId = selected?.project_id ?? null
  // Empty id matches nothing in json-server, so these stay empty until a project is picked.
  const plans = usePlan(selectedId ?? '').data ?? []
  const draft = useTenderDraft(selectedId ?? '').data ?? []
  const reports = useReports(selectedId ?? '').data ?? []
  const feedback = useFeedback().data ?? []

  const facts: Record<string, Fact> = {
    planning: plans.length > 0
      ? { text: `${plans.length} plan${plans.length === 1 ? '' : 's'} entered for this project.`, kind: 'entered' }
      : { text: 'No plans yet. Add one in Planning.', kind: 'missing' },
    'tender-design': draft.length > 0
      ? { text: 'Draft clauses saved for this project.', kind: 'entered' }
      : { text: 'No draft yet. Start one in Tender design.', kind: 'missing' },
    monitoring: reports.length > 0
      ? { text: `${reports.length} supervision report${reports.length === 1 ? '' : 's'} on file.`, kind: 'public' }
      : { text: 'No supervision reports for this project.', kind: 'missing' },
    learning: feedback.length > 0
      ? { text: `${feedback.length} feedback entr${feedback.length === 1 ? 'y' : 'ies'} recorded.`, kind: 'entered' }
      : { text: 'No feedback yet. Mark a recommendation in Planning.', kind: 'missing' },
  }

  // Phones and tablets have no hover: the first tap previews a step, the second tap opens it.
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  useEffect(() => setPinnedId(null), [selectedId])
  const activeId = hoverId ?? pinnedId
  const active = LIFECYCLE_STEPS.find((s) => s.id === activeId) ?? null

  const onStepSelect = (id: string) => {
    const step = LIFECYCLE_STEPS.find((s) => s.id === id)
    if (!step) return
    if (!selected) { setPinnedId(id); return } // no projects at all: a click pins the description instead of navigating
    if (touch && pinnedId !== id) { setPinnedId(id); return }
    navigate(step.to)
  }

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>World Bank open data · mock project records</p>
        <h1 id="hero-title" className={styles.title}>Procurement Intelligence Platform</h1>
        <p className={styles.sub}>
          Plan, design, monitor and learn from procurement on one traceable record. Every figure shows where it came from.
        </p>
        <DonutNav
          ariaLabel="Project lifecycle"
          size="var(--donut)"
          segments={LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: s.label, color: STEP_COLOR[s.id] ?? 'var(--primary)' }))}
          activeId={activeId}
          onActiveChange={setHoverId}
          onSelect={onStepSelect}
          centre={
            selected && projects.data ? (
              <WheelPicker
                ariaLabel="Project"
                items={projects.data.map((p) => ({ id: p.project_id, label: p.project_name }))}
                value={selected.project_id}
                onChange={setProject}
              />
            ) : <span className={styles.centre}>No projects</span>
          }
        />
        <div
          className={styles.info}
          style={{ borderTopColor: active ? STEP_COLOR[active.id] : undefined }}
          aria-live="polite"
        >
          {active ? (
            <>
              <div className={styles.infoHead}>
                <h2 className={styles.infoTitle}>{active.label}</h2>
                <span className={styles.hint}>
                  {selected ? `${touch ? 'Tap again' : 'Click'} to open` : 'Add a project to open'}
                </span>
              </div>
              <p className={styles.infoText}>{active.summary}</p>
              {selected && (
                <p className={styles.fact}><ProvenanceChip kind={facts[active.id]?.kind ?? 'missing'} /> {facts[active.id]?.text}</p>
              )}
            </>
          ) : (
            <p className={styles.infoText}>
              {selected
                ? `${touch ? 'Tap' : 'Hover'} a step to see what it does and what ${selected.project_name} has for it. ${touch ? 'Tap it again' : 'Click one'} to open it.`
                : 'No projects found. Hover or click a step to see what it does.'}
            </p>
          )}
        </div>
      </section>

      <Card
        title="Projects"
        aside={<ProvenanceChip kind="public" />}
        state={projects.isLoading ? 'loading' : projects.isError ? 'error' : 'ready'}
      >
        {(projects.data ?? []).length === 0 ? (
          <EmptyState title="No projects found" text="Add a project to mock/db.json and run pnpm reset-db." />
        ) : (
          <TableScroll><table className={styles.table}>
            <caption className={styles.caption}>Click a project name to open its overview, or scroll the wheel in the donut to open its four lifecycle steps.</caption>
            <thead>
              <tr><th scope="col">Project</th><th scope="col">Country</th><th scope="col">Sector</th><th scope="col">Region</th></tr>
            </thead>
            <tbody>
              {(projects.data ?? []).map((p) => (
                <tr key={p.project_id} className={p.project_id === selectedId ? styles.selected : undefined} onClick={() => setProject(p.project_id)}>
                  <td>
                    <button type="button" className={styles.rowButton} aria-pressed={p.project_id === selectedId} title="Open project overview" onClick={(e) => { e.stopPropagation(); setProject(p.project_id); navigate('/project') }}>
                      <span className={`${styles.id} mono`}>{p.project_id}</span> {p.project_name}
                    </button>
                  </td>
                  <td>{p.borrower_country}</td>
                  <td>{p.project_global_practice}</td>
                  <td>{p.region}</td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        )}
      </Card>

      <Card title="Platform tools" aside={<span className={styles.muted}>Shared across projects</span>}>
        <TableScroll><table className={styles.table}>
          <thead><tr><th scope="col">Area</th><th scope="col">What it holds</th></tr></thead>
          <tbody>
            {PLATFORM_AREAS.map((a) => (
              <tr key={a.to}>
                <td><Link to={a.to}>{a.label}</Link></td>
                <td>{a.summary}</td>
              </tr>
            ))}
          </tbody>
        </table></TableScroll>
      </Card>
    </>
  )
}
