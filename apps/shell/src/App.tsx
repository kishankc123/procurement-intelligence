import { lazy } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { FISCAL_YEARS, ROLES, fiscalYearLabel, type Role } from '@pi/config'
import { ProvenanceChip } from '@pi/ui'
import { tenderCoverage, useContracts, useEnrichments, useMeta, useProjects, useUiStore } from '@pi/data'
import { RemoteBoundary } from './RemoteBoundary'
import { Planned } from './pages/Planned'
import { ProjectData } from './pages/ProjectData'
import { TenderDesign } from './pages/TenderDesign'
import styles from './App.module.css'

const Planning = lazy(() => import('planning/Planning'))
const Learning = lazy(() => import('learning/Learning'))
const Monitoring = lazy(() => import('monitoring/Monitoring'))

const LIFECYCLE = [
  { to: '/planning', label: '1 · Planning' },
  { to: '/tender-design', label: '2 · Tender design' },
  { to: '/monitoring', label: '3 · Monitoring' },
  { to: '/learning', label: '4 · Learning' },
]
const PLATFORM = [
  { to: '/project-data', label: 'Project data' },
  { to: '/knowledge', label: 'Knowledge base' },
  { to: '/evidence', label: 'Evidence workbench' },
]

function Coverage() {
  const { projectId, fiscalYear } = useUiStore()
  const contracts = useContracts(projectId, fiscalYear).data ?? []
  const enrichments = useEnrichments().data ?? []
  const { covered, total } = tenderCoverage(contracts, enrichments)
  return (
    <div>
      <div className={styles.label}>Tender data entered</div>
      <progress max={Math.max(total, 1)} value={covered} aria-label="Tender data coverage" />
      <strong className="mono"> {covered} of {total} contracts</strong>
    </div>
  )
}

export function App() {
  const { projectId, fiscalYear, role, setProject, setFiscalYear, setRole } = useUiStore()
  const projects = useProjects().data ?? []
  const meta = useMeta().data

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Primary">
        <h1>ProcureIntel</h1>
        <p className={styles.group}>Lifecycle</p>
        {LIFECYCLE.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
        <p className={styles.group}>Platform</p>
        {PLATFORM.map((n) => <NavLink key={n.to} to={n.to}>{n.label}</NavLink>)}
        <p className={`${styles.foot} mono`}>Shell: micro-frontend host</p>
      </nav>
      <div className={styles.main}>
        <header className={styles.top}>
          <label>Fiscal year
            <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
              {FISCAL_YEARS.map((fy) => <option key={fy} value={fy}>{fiscalYearLabel(fy)}</option>)}
            </select>
          </label>
          <label>Project
            <select value={projectId} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_id} · {p.project_name}</option>)}
            </select>
          </label>
          <label>Role (demo switcher, no sign-in)
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <Coverage />
          <div className={styles.legend}>
            <ProvenanceChip kind="public" /><ProvenanceChip kind="entered" /><ProvenanceChip kind="derived" />
          </div>
        </header>
        <div className={styles.banner} role="note"><strong>Mock data.</strong> {meta?.dataset_label ?? '…'}. Every figure is bound to data and shows its source.</div>
        <main className={styles.content}>
          <Routes>
            <Route index element={<Navigate to="/planning" replace />} />
            <Route path="/planning" element={<RemoteBoundary name="Planning"><Planning /></RemoteBoundary>} />
            <Route path="/monitoring" element={<RemoteBoundary name="Monitoring"><Monitoring /></RemoteBoundary>} />
            <Route path="/learning" element={<RemoteBoundary name="Learning"><Learning /></RemoteBoundary>} />
            <Route path="/tender-design" element={<TenderDesign />} />
            <Route path="/project-data" element={<ProjectData />} />
            <Route path="*" element={<Planned />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
