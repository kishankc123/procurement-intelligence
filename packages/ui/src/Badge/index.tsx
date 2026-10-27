import styles from './Badge.module.css'

type Tone = 'high' | 'medium' | 'low' | 'neutral'
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}
