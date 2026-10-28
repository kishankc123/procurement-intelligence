import { FISCAL_YEARS, ROLES, fiscalYearLabel, type Role } from '@pi/config'
import { useProjects, useUiStore } from '@pi/data'
import { Select } from '@pi/ui'
import styles from './App.module.css'

/** Left rail with the global filters: project, fiscal year and the demo role switcher. Closed by default; the arrow opens it. */
export function FilterRail({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
