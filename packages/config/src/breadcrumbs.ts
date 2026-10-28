import { LIFECYCLE_STEPS, PLATFORM_AREAS } from './index'

export interface Crumb {
  label: string
  /** Where the crumb links; absent for the page you are on and for groups that have no page of their own. */
  to?: string
}

/**
 * The breadcrumb trail for an address, always starting at Home. `names` supplies labels the address alone cannot give,
 * such as the name of the plan in /planning/full-details/<id>. The dashboard itself has no trail.
 */
export function breadcrumbTrail(pathname: string, names: { plan?: string } = {}): Crumb[] {
  if (pathname === '/') return []
  const home: Crumb = { label: 'Home', to: '/' }

  const step = LIFECYCLE_STEPS.find((s) => pathname === s.to || pathname.startsWith(`${s.to}/`))
  if (step) {
    const rest = pathname.slice(step.to.length).split('/').filter(Boolean)
    if (rest.length === 0) return [home, { label: step.label }]
    if (step.id === 'planning' && rest[0] === 'full-details' && rest[1]) {
      return [home, { label: step.label, to: step.to }, { label: names.plan ?? decodeURIComponent(rest[1]) }]
    }
    return [home, { label: step.label, to: step.to }, { label: rest.map(decodeURIComponent).join(' / ') }]
  }

  const area = PLATFORM_AREAS.find((a) => pathname === a.to)
  if (area) return [home, { label: 'Tools' }, { label: area.label }]
  if (pathname === '/project') return [home, { label: 'Project overview' }]
  if (pathname === '/work-with-ai') return [home, { label: 'Work with AI' }]
  return [home, { label: 'Page not found' }]
}
