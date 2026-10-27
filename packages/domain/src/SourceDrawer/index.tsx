import { useChunks, useDocs, useRecommendations, useUiStore, type Citation } from '@pi/data'
import { Button } from '@pi/ui'
import styles from './SourceDrawer.module.css'

interface Props { citation: Citation | null; onClose: () => void }

/** Shared evidence drawer: chunk text, page, document and every recommendation that cites it. */
export function SourceDrawer({ citation, onClose }: Props) {
  const projectId = useUiStore((s) => s.projectId)
  const chunks = useChunks().data ?? []
  const docs = useDocs().data ?? []
  const recs = useRecommendations(projectId).data ?? []
  if (!citation) return null

  const chunk = citation.ref_type === 'chunk' ? chunks.find((c) => c.chunk_id === citation.ref_id) : undefined
  const doc = chunk ? docs.find((d) => d.doc_id === chunk.doc_id) : undefined
  const citedBy = recs.filter((r) => r.citations.some((c) => c.ref_id === citation.ref_id))

  return (
    <aside className={styles.drawer} role="dialog" aria-label="Source evidence">
      <header><h2>Evidence</h2><Button onClick={onClose}>Close</Button></header>
      <p className="mono">{citation.label}</p>
      {chunk && doc ? (
        <>
          <blockquote>{chunk.text}</blockquote>
          <dl>
            <dt>Document</dt><dd>{doc.title} ({doc.doc_id})</dd>
            <dt>Page</dt><dd>{chunk.page}</dd>
            <dt>Section</dt><dd>{chunk.section_path}</dd>
            <dt>Chunk</dt><dd className="mono">{chunk.chunk_id}</dd>
          </dl>
        </>
      ) : (
        <p>This evidence is a stored record: <span className="mono">{citation.ref_id}</span>.</p>
      )}
      <h3>Cited by</h3>
      {citedBy.length === 0 ? <p>No recommendation cites this on the selected project.</p> : <ul>{citedBy.map((r) => <li key={r.id}>{r.title}</li>)}</ul>}
    </aside>
  )
}
