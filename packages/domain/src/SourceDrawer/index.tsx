import { Fragment } from 'react'
import { useAmendments, useChunks, useContracts, useDocs, useEnrichments, usePlan, useRecommendations, useReports, useUiStore, type Citation } from '@pi/data'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pi/ui'
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
  const record: Record<string, unknown> | undefined = citation?.ref_type === 'record'
    ? [...enrichments, ...amendments, ...reports, ...plans, ...contracts].find((r) => r.id === citation.ref_id)
    : undefined

  const chunk = citation?.ref_type === 'chunk' ? chunks.find((c) => c.chunk_id === citation.ref_id) : undefined
  const doc = chunk ? docs.find((d) => d.doc_id === chunk.doc_id) : undefined
  const citedBy = citation ? recs.filter((r) => r.citations.some((c) => c.ref_id === citation.ref_id)) : []

  // A modal dialog styled as a right-hand panel: focus is trapped, Escape and a click outside close it.
  return (
    <Dialog open={citation !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false} aria-describedby={undefined}
        className={`${styles.drawer} fixed top-0 right-0 bottom-0 left-auto h-screen w-[420px] max-w-full translate-x-0 translate-y-0 content-start overflow-auto rounded-none p-5 sm:max-w-[420px] data-open:slide-in-from-right data-open:zoom-in-100 data-closed:slide-out-to-right data-closed:zoom-out-100`}
      >
        <DialogHeader className={styles.head}>
          <DialogTitle className="text-lg font-semibold">Evidence</DialogTitle>
          <Button variant="danger" onClick={onClose}>Close</Button>
        </DialogHeader>
        <DialogDescription className="mono text-foreground">{citation?.label}</DialogDescription>
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
          ) : <p>Record <span className="mono">{citation?.ref_id}</span> was not found.</p>
        )}
        <h3>Cited by</h3>
        {citedBy.length === 0 ? <p>No recommendation cites this on the selected project.</p> : <ul>{citedBy.map((r) => <li key={r.id}>{r.title}</li>)}</ul>}
      </DialogContent>
    </Dialog>
  )
}
