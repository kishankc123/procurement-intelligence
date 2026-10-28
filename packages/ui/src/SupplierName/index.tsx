import { Building2 } from '../icons'
import styles from './SupplierName.module.css'

/**
 * A supplier's name with a very small organization icon in front, like the small avatars in a contacts list.
 * Every supplier in the data is an organization (the public record has no person type), so they all get the same icon.
 */
export function SupplierName({ name }: { name: string }) {
  return (
    <span className={styles.root}>
      <span className={styles.icon} aria-hidden="true" title="Organization"><Building2 size={12} /></span>
      <span>{name}</span>
    </span>
  )
}
