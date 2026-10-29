import { lazy, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { RemoteBoundary } from './RemoteBoundary'
import { Home } from './pages/Home'
import { BackButton } from './BackButton'
import { Breadcrumbs } from './Breadcrumbs'
import { StepNav } from './StepNav'
import { FilterRail } from './FilterRail'
import { Planned } from './pages/Planned'
import { ProjectData } from './pages/ProjectData'
import { TenderDesign } from './pages/TenderDesign'
import { Knowledge } from './pages/Knowledge'
import { Evidence } from './pages/Evidence'
import { Suppliers } from './pages/Suppliers'
import { ProjectOverview } from './pages/ProjectOverview'
import styles from './App.module.css'

const Planning = lazy(() => import('planning/Planning'))
const Learning = lazy(() => import('learning/Learning'))
const Monitoring = lazy(() => import('monitoring/Monitoring'))
const WorkWithAI = lazy(() => import('ai/WorkWithAI'))

export function App() {
  const [railOpen, setRailOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className={`${styles.layout} ${railOpen ? styles.layoutRailOpen : ''}`}>
      <FilterRail open={railOpen} onOpenChange={setRailOpen} />
      <div className={styles.main}>
        <header className={styles.top}>
          <Link to="/" className={styles.brand}>ProcureIntel</Link>
        </header>
        {/* <div className={styles.banner} role="note"><strong>Mock data.</strong> {meta?.dataset_label ?? '…'}. Every figure is bound to data and shows its source.</div> */}
        <main className={styles.content}>
          {pathname !== '/' && <BackButton />}
          <Breadcrumbs />
          {pathname !== '/' && <StepNav />}
          <Routes>
            <Route index element={<Home />} />
            <Route path="/planning/*" element={<RemoteBoundary name="Planning"><Planning /></RemoteBoundary>} />
            <Route path="/monitoring" element={<RemoteBoundary name="Monitoring"><Monitoring /></RemoteBoundary>} />
            <Route path="/learning" element={<RemoteBoundary name="Learning"><Learning /></RemoteBoundary>} />
            <Route path="/tender-design" element={<TenderDesign />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="/project-data" element={<ProjectData />} />
            <Route path="/work-with-ai" element={<RemoteBoundary name="Work with AI"><WorkWithAI /></RemoteBoundary>} />
            <Route path="/schedule" element={<Navigate to="/monitoring" replace />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/project" element={<ProjectOverview />} />
            <Route path="*" element={<Planned />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
