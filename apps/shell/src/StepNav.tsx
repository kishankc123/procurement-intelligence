import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { LIFECYCLE_STEPS, PLATFORM_AREAS, fiscalYearLabel } from '@pi/config'
import { useProjects, useUiStore } from '@pi/data'
import { DonutNav } from '@pi/ui'
import { STEP_COLOR } from './stepColors'
import styles from './StepNav.module.css'

/** Mini donut at the top of every inner page: the current step stays lit, any slice switches step, the centre goes back to the dashboard. */
export function StepNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { projectId, fiscalYear } = useUiStore()
  const project = useProjects().data?.find((p) => p.project_id === projectId)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const current = LIFECYCLE_STEPS.find((s) => s.to === pathname)
  const platform = PLATFORM_AREAS.find((a) => a.to === pathname)
  const hovered = LIFECYCLE_STEPS.find((s) => s.id === hoverId)
  const overview = pathname === '/project'
  const title = hovered?.label ?? current?.label ?? platform?.label ?? (overview ? 'Project overview' : 'ProcureIntel')
  const eyebrow = hovered ? 'Go to' : current ? 'Lifecycle step' : overview ? 'Project' : 'Platform tool'

  return (
    <nav className={styles.bar} aria-label="Lifecycle steps">
      <div className={styles.donut}>
        <DonutNav
          compact
          ariaLabel="Lifecycle steps"
          segments={LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: s.label, color: STEP_COLOR[s.id] ?? 'var(--primary)' }))}
          activeId={hoverId ?? current?.id ?? null}
          onActiveChange={setHoverId}
          onSelect={(id) => {
            const step = LIFECYCLE_STEPS.find((s) => s.id === id)
            if (step) navigate(step.to)
          }}
          centre={
            <Link to="/" className={styles.home} aria-label="Back to the dashboard" title="Back to the dashboard">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M4 11l8-7 8 7M6 10v9h4v-5h4v5h4v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          }
        />
      </div>
      <div className={styles.text}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.title}>{title}</h2>
        {project && <p className={styles.sub}><span className="mono">{project.project_id}</span> · {project.project_name} · {fiscalYearLabel(fiscalYear).split(' · ')[0]}</p>}
      </div>
    </nav>
  )
}
