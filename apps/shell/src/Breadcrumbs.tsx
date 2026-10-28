import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'
import { breadcrumbTrail } from '@pi/config'
import { usePlan, useUiStore } from '@pi/data'
import { ChevronRight } from '@pi/ui'
import styles from './Breadcrumbs.module.css'

/** "Home / Planning / Plan name" above every inner page. Each crumb but the last links back; the last marks the current page. */
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const projectId = useUiStore((s) => s.projectId)
  const plans = usePlan(projectId).data
  const planId = pathname.startsWith('/planning/full-details/') ? decodeURIComponent(pathname.split('/')[3] ?? '') : ''
  const trail = breadcrumbTrail(pathname, { plan: plans?.find((p) => p.id === planId)?.name })
  if (trail.length === 0) return null
  return (
    <nav className={styles.nav} aria-label="Breadcrumb">
      <ol className={styles.list}>
        {trail.map((c, i) => {
          const last = i === trail.length - 1
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li className={styles.item}>
                {last || !c.to ? <span className={last ? styles.current : styles.group} aria-current={last ? 'page' : undefined}>{c.label}</span> : <Link to={c.to} className={styles.link}>{c.label}</Link>}
              </li>
              {!last && <li className={styles.sep} aria-hidden="true"><ChevronRight size={14} /></li>}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
