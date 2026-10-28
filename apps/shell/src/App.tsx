import { lazy } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { PLATFORM_AREAS } from '@pi/config'
import { useProjects, useUiStore } from '@pi/data'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@pi/ui'
import { RemoteBoundary } from './RemoteBoundary'
import { Home } from './pages/Home'
import { StepNav } from './StepNav'
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

/** Top-bar "Projects" menu: plain text that opens a list. Picking a project sets it for every screen. */
function ProjectMenu() {
  const navigate = useNavigate()
  const { projectId, setProject } = useUiStore()
  const projects = useProjects().data ?? []
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={styles.navTrigger}>Projects <span aria-hidden="true">▾</span></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuLabel>Open a project overview</DropdownMenuLabel>
        {projects.map((project) => (
          <DropdownMenuItem key={project.project_id} title="Open project overview" onSelect={() => { setProject(project.project_id); navigate('/project') }}>
            {project.project_name}
            {project.project_id === projectId && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Top-bar "Tools" menu: the platform areas that work across projects. */
function ToolsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={styles.navTrigger}>Tools <span aria-hidden="true">▾</span></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {PLATFORM_AREAS.map((area) => (
          <DropdownMenuItem key={area.to} asChild>
            <Link to={area.to}>{area.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function App() {
  const { pathname } = useLocation()

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <header className={styles.top}>
          <Link to="/" className={styles.brand}>ProcureIntel</Link>
          <nav className={styles.topNav} aria-label="Main">
            <ProjectMenu />
            <ToolsMenu />
          </nav>
          <Link to="/work-with-ai" className={styles.aiLink}>Work with AI</Link>
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
