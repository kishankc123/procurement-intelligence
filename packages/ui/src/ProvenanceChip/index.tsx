export type Provenance = 'public' | 'entered' | 'derived' | 'missing'
import styles from './ProvenanceChip.module.css'

const LABEL: Record<Provenance, string> = { public: 'Public', entered: 'Entered', derived: 'Derived', missing: 'Missing' }

interface Props { kind: Provenance; detail?: string }

/** Every field shows one of these. Text label always present, never colour alone. */
export function ProvenanceChip({ kind, detail }: Props) {
  return <span className={`${styles.chip} ${styles[kind]}`}>{LABEL[kind]}{detail ? ` · ${detail}` : ''}</span>
}
