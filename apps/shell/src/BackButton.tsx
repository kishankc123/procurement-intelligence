import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft } from '@pi/ui'
import styles from './BackButton.module.css'

/**
 * Goes back one page inside the site, like the browser's back button.
 * If this is the first page opened in this tab there is nothing to go back to, so it goes to the dashboard instead.
 */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate()
  const { key } = useLocation() // 'default' on the first entry of the session
  const hasHistory = key !== 'default'
  const label = hasHistory ? 'Back' : 'Dashboard'
  return (
    <button
      type="button"
      className={styles.back}
      onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
      aria-label={hasHistory ? 'Go back to the previous page' : 'Go to the dashboard'}
      title={hasHistory ? 'Go back to the previous page' : 'Go to the dashboard'}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
