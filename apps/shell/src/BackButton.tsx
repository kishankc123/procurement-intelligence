import { useLocation, useNavigate } from 'react-router'
import { ChevronLeft } from '@pi/ui'
import styles from './BackButton.module.css'

/**
 * An arrowhead above the breadcrumbs that goes back one page inside the site, like the browser's back button.
 * If this is the first page opened in this tab there is nothing to go back to, so it goes to the dashboard instead.
 */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate()
  const { key } = useLocation() // 'default' on the first entry of the session
  const hasHistory = key !== 'default'
  return (
    <button
      type="button"
      className={styles.back}
      onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
      aria-label={hasHistory ? 'Go back to the previous page' : 'Go to the dashboard'}
      title={hasHistory ? 'Go back to the previous page' : 'Go to the dashboard'}
    >
      <ChevronLeft size={28} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
