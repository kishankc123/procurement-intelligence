import type { Citation } from '@pi/data'
import styles from './CitationChip.module.css'

interface Props { citation: Citation; onOpen: (c: Citation) => void }

export function CitationChip({ citation, onOpen }: Props) {
  return <button type="button" className={styles.chip} onClick={() => onOpen(citation)}>{citation.label}</button>
}
