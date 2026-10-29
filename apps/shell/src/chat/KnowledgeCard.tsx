import { useState } from 'react'
import { useDocs, useFetchSource, useMeta, useSources } from '@pi/data'
import { Badge, Button, Card, FileText, Paged, ProvenanceChip } from '@pi/ui'
import { DocumentDialog } from '@pi/domain'
import { MissingInfo } from './CardBoundary'
import styles from './ToolCards.module.css'

/**
 * Where the data comes from: the source registry and the documents behind the answers. A project narrows the documents to its own
 * (and the general guidance); without one every document is listed. Opening a document shows its text full screen.
 */
export function KnowledgeCard({ projectId }: { projectId: string | null }) {
  const sources = useSources()
  const docs = useDocs()
  const asOf = useMeta().data?.as_of_date ?? ''
  const fetchSource = useFetchSource(asOf)
  const [docId, setDocId] = useState<string | null>(null)
  if (sources.isLoading || docs.isLoading) return <Card state="loading">{null}</Card>
  const list = (sources.data ?? [])
  const documents = (docs.data ?? []).filter((d) => !projectId || d.project_id === projectId || d.project_id === 'GENERAL')

  return (
    <div className={styles.card}>
      {sources.isError || list.length === 0
        ? <MissingInfo title="Source registry" text={sources.isError ? 'The source registry could not be read, so the list of sources is missing.' : 'No sources are registered, so I cannot say where the data comes from.'} />
        : (
          <Card title="Source registry" aside={<Badge>Simulated fetch</Badge>}>
            <Paged items={list} label="sources" maxHeight="320px">{(rows) =>
              <table className={styles.table}>
                <thead><tr><th>Source</th><th>Publisher</th><th>Kind</th><th>Status</th><th>Last fetched</th><th /></tr></thead>
                <tbody>{rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}<br /><span className={`${styles.mono} ${styles.sub}`}>{s.id}</span></td><td>{s.publisher}</td><td>{s.kind}</td>
                    <td>{s.status === 'fetched' ? <Badge tone="low">Fetched (simulated)</Badge> : <Badge>Registered</Badge>}</td>
                    <td className={styles.mono}>{s.last_fetched ?? <ProvenanceChip kind="missing" detail="never" />}</td>
                    <td><Button onClick={() => fetchSource.mutate({ id: s.id })} disabled={fetchSource.isPending}>Fetch</Button></td>
                  </tr>
                ))}</tbody>
              </table>}
            </Paged>
          </Card>
        )}

      {docs.isError || documents.length === 0
        ? <MissingInfo title="Documents" text={docs.isError ? 'The documents could not be read, so the list is missing.' : 'No documents are ingested for this selection yet.'} />
        : (
          <Card title="Documents" aside={<ProvenanceChip kind="public" detail={`n=${documents.length}`} />}>
            <Paged items={documents} label="documents" maxHeight="360px">{(rows) =>
              <table className={styles.table}>
                <thead><tr><th>Document</th><th>Type</th><th>Date</th><th>Pages</th><th>Parse</th></tr></thead>
                <tbody>{rows.map((d) => (
                  <tr key={d.doc_id}>
                    <td>
                      <button type="button" className={styles.docRow} onClick={() => setDocId(d.doc_id)} aria-label={`Open ${d.title}`}>
                        <span className={styles.docIcon} aria-hidden="true"><FileText size={16} /></span>
                        <span className={styles.docText}><strong>{d.title}</strong><span className={`${styles.mono} ${styles.sub}`}>{d.doc_id}</span></span>
                      </button>
                    </td>
                    <td>{d.type}</td><td className={styles.mono}>{d.date}</td><td className={styles.mono}>{d.pages > 0 ? d.pages : '—'}</td>
                    <td><Badge tone={d.parse_status === 'parsed' ? 'low' : d.parse_status === 'failed' ? 'high' : 'medium'}>{d.parse_status}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>}
            </Paged>
          </Card>
        )}
      <DocumentDialog docId={docId} onClose={() => setDocId(null)} />
    </div>
  )
}
