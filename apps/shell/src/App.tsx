import { lazy, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router'
import { FISCAL_YEARS, ROLES, fiscalYearLabel, type Role } from '@pi/config'
import { Select } from '@pi/ui'
import { useMeta, useProjects, useUiStore } from '@pi/data'
import { RemoteBoundary } from './RemoteBoundary'
import { Home } from './pages/Home'
import { StepNav } from './StepNav'
import { Planned } from './pages/Planned'
import { ProjectData } from './pages/ProjectData'
import { TenderDesign } from './pages/TenderDesign'
import { Knowledge } from './pages/Knowledge'
import { Evidence } from './pages/Evidence'
import styles from './App.module.css'

const Planning = lazy(() => import('planning/Planning'))
const Learning = lazy(() => import('learning/Learning'))
const Monitoring = lazy(() => import('monitoring/Monitoring'))

/** Left rail with the global filters. Closed by default so the page stays clean; the arrow opens it. */
function FilterRail({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { projectId, fiscalYear, role, setProject, setFiscalYear, setRole } = useUiStore()
  const projects = useProjects().data ?? []
  return (
    <aside className={`${styles.rail} ${open ? styles.railOpen : ''}`} aria-label="Filters">
      {open && <button type="button" className={styles.scrim} aria-label="Close filters" tabIndex={-1} onClick={() => onOpenChange(false)} />}
      <div className={styles.railBody}>
      <button
        type="button"
        className={styles.railToggle}
        aria-expanded={open}
        aria-controls="filters-panel"
        aria-label={open ? 'Close filters' : 'Open filters'}
        onClick={() => onOpenChange(!open)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={open ? styles.chevronOpen : undefined}>
          <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div id="filters-panel" className={styles.panel}>
          <h2 className={styles.panelTitle}>Filters</h2>
          <label>Project
            <Select value={projectId} onValueChange={setProject} options={projects.map((p) => ({ value: p.project_id, label: `${p.project_id} · ${p.project_name}` }))} />
          </label>
          <label>Fiscal year
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))} options={FISCAL_YEARS.map((fy) => ({ value: String(fy), label: fiscalYearLabel(fy) }))} />
          </label>
          <label>Role (demo switcher, no sign-in)
            <Select value={role} onValueChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} />
          </label>
        </div>
      ) : (
        <span className={styles.railLabel} aria-hidden="true">Project · Year · Role</span>
      )}
      </div>
    </aside>
  )
}

export function App() {
  const [railOpen, setRailOpen] = useState(false)
  const { pathname } = useLocation()
  const meta = useMeta().data

  return (
    <div className={`${styles.layout} ${railOpen ? styles.layoutRailOpen : ''}`}>
      <FilterRail open={railOpen} onOpenChange={setRailOpen} />
      <div className={styles.main}>
        <header className={styles.top}>
          <Link to="/" className={styles.brand}>ProcureIntel</Link>
        </header>
        {/* <div className={styles.banner} role="note"><strong>Mock data.</strong> {meta?.dataset_label ?? '…'}. Every figure is bound to data and shows its source.</div> */}
        <main className={styles.content}>
          {pathname !== '/' && <StepNav />}
          <Routes>
            <Route index element={<Home />} />
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
