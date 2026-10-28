import { lazy, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { PLATFORM_AREAS } from '@pi/config'
import { useProjects, useUiStore } from '@pi/data'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
  BookOpen, ChevronDown, Database, FolderKanban, Scale, Truck, Wrench, type LucideIcon,
} from '@pi/ui'
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

/** One icon per platform tool, by route. */
const TOOL_ICON: Record<string, LucideIcon> = {
  '/project-data': Database, '/knowledge': BookOpen, '/suppliers': Truck, '/evidence': Scale,
}

/** Top-bar "Projects" menu: plain text that opens a list. Picking a project sets it for every screen. */
function ProjectMenu() {
  const navigate = useNavigate()
  const { projectId, setProject } = useUiStore()
  const projects = useProjects().data ?? []
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={styles.navTrigger}><FolderKanban size={16} aria-hidden="true" />Projects<ChevronDown size={14} aria-hidden="true" /></button>
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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={styles.navTrigger}><Wrench size={16} aria-hidden="true" />Tools<ChevronDown size={14} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {PLATFORM_AREAS.map((area) => {
          const Icon = TOOL_ICON[area.to]
          return (
            <DropdownMenuItem key={area.to} asChild>
              <Link to={area.to} className="no-underline">{Icon && <Icon size={16} aria-hidden="true" />}{area.label}</Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function App() {
  const [railOpen, setRailOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className={`${styles.layout} ${railOpen ? styles.layoutRailOpen : ''}`}>
      <FilterRail open={railOpen} onOpenChange={setRailOpen} />
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
