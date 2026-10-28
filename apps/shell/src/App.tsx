import { lazy } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { FISCAL_YEARS, ROLES, fiscalYearLabel, type Role } from '@pi/config'
import { ProvenanceChip, Select } from '@pi/ui'
import { tenderCoverage, useContracts, useEnrichments, useMeta, useProjects, useUiStore } from '@pi/data'
import { RemoteBoundary } from './RemoteBoundary'
import { Planned } from './pages/Planned'
import { ProjectData } from './pages/ProjectData'
import { TenderDesign } from './pages/TenderDesign'
import { Knowledge } from './pages/Knowledge'
import { Evidence } from './pages/Evidence'
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
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))} options={FISCAL_YEARS.map((fy) => ({ value: String(fy), label: fiscalYearLabel(fy) }))} />
          </label>
          <label>Project
            <Select value={projectId} onValueChange={setProject} options={projects.map((p) => ({ value: p.project_id, label: `${p.project_id} · ${p.project_name}` }))} />
          </label>
          <label>Role (demo switcher, no sign-in)
            <Select value={role} onValueChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} />
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
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="/project-data" element={<ProjectData />} />
            <Route path="*" element={<Planned />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
