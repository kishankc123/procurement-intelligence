import { Fragment } from 'react'
import { useAmendments, useChunks, useContracts, useDocs, useEnrichments, usePlan, useRecommendations, useReports, useUiStore, type Citation } from '@pi/data'
import { Button } from '@pi/ui'
import styles from './SourceDrawer.module.css'

interface Props { citation: Citation | null; onClose: () => void }

/** Shared evidence drawer: chunk text, page, document and every recommendation that cites it. */
export function SourceDrawer({ citation, onClose }: Props) {
  const projectId = useUiStore((s) => s.projectId)
  const chunks = useChunks().data ?? []
  const docs = useDocs().data ?? []
  const recs = useRecommendations(projectId).data ?? []
  const enrichments = useEnrichments().data ?? []
  const amendments = useAmendments().data ?? []
  const reports = useReports(projectId).data ?? []
  const plans = usePlan(projectId).data ?? []
  const contracts = (useContracts(projectId).data ?? []).map((c) => ({ ...c, id: c.borrower_contract_reference_number }))
  if (!citation) return null
  const record: Record<string, unknown> | undefined = citation.ref_type === 'record'
    ? [...enrichments, ...amendments, ...reports, ...plans, ...contracts].find((r) => r.id === citation.ref_id)
    : undefined

  const chunk = citation.ref_type === 'chunk' ? chunks.find((c) => c.chunk_id === citation.ref_id) : undefined
  const doc = chunk ? docs.find((d) => d.doc_id === chunk.doc_id) : undefined
  const citedBy = recs.filter((r) => r.citations.some((c) => c.ref_id === citation.ref_id))

  return (
    <aside className={styles.drawer} role="dialog" aria-label="Source evidence">
      <header><h2>Evidence</h2><Button variant="danger" onClick={onClose}>Close</Button></header>
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
        record ? (
          <dl>{Object.entries(record).filter(([, v]) => typeof v !== 'object').map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className="mono">{String(v)}</dd></Fragment>)}</dl>
        ) : <p>Record <span className="mono">{citation.ref_id}</span> was not found.</p>
      )}
      <h3>Cited by</h3>
      {citedBy.length === 0 ? <p>No recommendation cites this on the selected project.</p> : <ul>{citedBy.map((r) => <li key={r.id}>{r.title}</li>)}</ul>}
    </aside>
  )
}
