import { useChunks, useDocs, type Chunk, type Doc } from '@pi/data'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, FileText, Pagination, ProvenanceChip, usePagination } from '@pi/ui'
import styles from './DocumentDialog.module.css'

const PARSE_TONE = { parsed: 'low', pending: 'medium', failed: 'high' } as const

/** Chunks of one section sit under one heading, in page order, like the sections of the document. */
function bySection(chunks: Chunk[]): { section: string; items: Chunk[] }[] {
  const out: { section: string; items: Chunk[] }[] = []
  for (const c of [...chunks].sort((a, b) => a.page - b.page)) {
    const last = out[out.length - 1]
    if (last && last.section === c.section_path) last.items.push(c)
    else out.push({ section: c.section_path, items: [c] })
  }
  return out
}

function Body({ doc, chunks }: { doc: Doc; chunks: Chunk[] }) {
  const list = usePagination(bySection(chunks), 4)
  if (chunks.length === 0) {
    return (
      <EmptyState
        title="No text to show"
        text={doc.parse_status === 'parsed' ? 'This document was parsed but no chunks were stored.' : `Parse status is ${doc.parse_status}, so nothing was read from this document. Nothing is estimated.`}
      />
    )
  }
  return (
    <>
      {list.items.map((s) => (
        <section key={s.section} className={styles.section}>
          <h3>{s.section}</h3>
          {s.items.map((c) => (
            <div key={c.chunk_id} className={styles.chunk}>
              <span className={styles.page}>Page {c.page}</span>
              <p>{c.text}</p>
              <span className={`mono ${styles.meta}`}>{c.chunk_id} · {c.token_count} tokens · embedding {c.embedding_status}</span>
            </div>
          ))}
        </section>
      ))}
      <Pagination list={list} label="sections" />
    </>
  )
}

/**
 * A document opened full screen: its type, title and details at the top, then its text by section.
 * Used from the Knowledge base and from the evidence drawer. Closes with the button or Escape.
 */
export function DocumentDialog({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const doc = (useDocs().data ?? []).find((d) => d.doc_id === docId)
  const chunks = (useChunks().data ?? []).filter((c) => c.doc_id === docId)
  return (
    <Dialog open={docId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false} aria-describedby={undefined}
        className={`${styles.screen} fixed inset-0 top-0 left-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 content-start overflow-auto rounded-none p-0 sm:max-w-none`}
      >
        <div className={styles.bar}>
          <span className={styles.icon} aria-hidden="true"><FileText size={20} /></span>
          <div className={styles.barText}>
            <DialogTitle className="text-lg font-semibold">{doc?.title ?? 'Document'}</DialogTitle>
            <DialogDescription className={styles.sub}>{doc ? `${doc.type} · ${doc.doc_id}` : `Document ${docId} was not found.`}</DialogDescription>
          </div>
          <Button variant="danger" onClick={onClose}>Close</Button>
        </div>
        {doc && (
          <div className={styles.paper}>
            <dl className={styles.facts}>
              <div><dt>Type</dt><dd>{doc.type}</dd></div>
              <div><dt>Date</dt><dd className="mono">{doc.date}</dd></div>
              <div><dt>Pages</dt><dd className="mono">{doc.pages}</dd></div>
              <div><dt>Project</dt><dd className="mono">{doc.project_id}</dd></div>
              <div><dt>Parse status</dt><dd><Badge tone={PARSE_TONE[doc.parse_status as keyof typeof PARSE_TONE] ?? 'neutral'}>{doc.parse_status}</Badge></dd></div>
              <div><dt>Source</dt><dd><ProvenanceChip kind="public" detail="mock document" /></dd></div>
            </dl>
            <Body doc={doc} chunks={chunks} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
