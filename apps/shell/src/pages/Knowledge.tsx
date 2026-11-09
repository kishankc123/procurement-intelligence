import { useState } from 'react'
import { useDocs, useFetchSource, useMeta, useSources } from '@pi/data'
import { Badge, Button, Card, EmptyState, FileText, ProvenanceChip, Select, TableScroll, Paged } from '@pi/ui'
import { DocumentDialog } from '@pi/domain'
import styles from './ProjectData.module.css'

export function Knowledge() {
  const sources = useSources()
  const docs = useDocs().data ?? []
  const asOf = useMeta().data?.as_of_date ?? ''
  const fetchSource = useFetchSource(asOf)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [docId, setDocId] = useState<string | null>(null)

  if (sources.isLoading) return <Card state="loading">{null}</Card>
  if (sources.isError) return <Card state="error">{null}</Card>

  const types = [...new Set(docs.map((d) => d.type))]
  const visible = docs.filter((d) => (!type || d.type === type) && `${d.title} ${d.doc_id}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className={styles.page}>
      <div><h1>Knowledge base</h1><p className={styles.sub}>Source registry, ingested documents and their chunks. Fetching is simulated: nothing is downloaded.</p></div>

      <Card title="Source registry" aside={<Badge>Simulated fetch</Badge>}>
        <Paged items={sources.data ?? []} label="sources" maxHeight="360px">{(pageRows) => <table className={styles.table}>
          <thead><tr><th>Source</th><th>Publisher</th><th>Kind</th><th>Status</th><th>Last fetched</th><th /></tr></thead>
          <tbody>{pageRows.map((s) => (
            <tr key={s.id}>
              <td>{s.name}<br /><span className="mono">{s.id}</span></td><td>{s.publisher}</td><td>{s.kind}</td>
              <td>{s.status === 'fetched' ? <Badge tone="low">Fetched (simulated)</Badge> : <Badge>Registered</Badge>}</td>
              <td className="mono">{s.last_fetched ?? <ProvenanceChip kind="missing" detail="never" />}</td>
              <td><Button onClick={() => fetchSource.mutate({ id: s.id })} disabled={fetchSource.isPending}>Fetch</Button></td>
            </tr>
          ))}</tbody>
        </table>}</Paged>
      </Card>

      <Card title="Documents" aside={<ProvenanceChip kind="public" detail="mock titles" />}>
        <div className={styles.filterRow}>
          <input aria-label="Search documents" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select aria-label="Filter by type" value={type || 'all'} onValueChange={(v) => setType(v === 'all' ? '' : v)} options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: t }))]} />
        </div>
        {visible.length === 0 ? <EmptyState title="No documents match" /> : (
          <Paged items={visible} label="documents" resetKey={`${query}|${type}`} maxHeight="520px">{(pageRows) =><table className={styles.table}>
            <thead><tr><th>Document</th><th>Type</th><th>Date</th><th>Pages</th><th>Parse</th></tr></thead>
            <tbody>{pageRows.map((d) => (
              <tr key={d.doc_id}>
                <td>
                  <button type="button" className={styles.docRow} onClick={() => setDocId(d.doc_id)} aria-label={`Open ${d.title}`}>
                    <span className={styles.docIcon} aria-hidden="true"><FileText size={18} /></span>
                    <span className={styles.docText}><strong>{d.title}</strong><span className="mono">{d.doc_id}</span></span>
                  </button>
                </td>
                <td>{d.type}</td><td className="mono">{d.date}</td><td className="mono">{d.pages > 0 ? d.pages : '—'}</td>
                <td><Badge tone={d.parse_status === 'parsed' ? 'low' : d.parse_status === 'failed' ? 'high' : 'medium'}>{d.parse_status}</Badge></td>
              </tr>
            ))}</tbody>
          </table>}</Paged>
        )}
        <p className={styles.sub}>Click a document to open it full screen with its text by section.</p>
      </Card>
      <DocumentDialog docId={docId} onClose={() => setDocId(null)} />
    </div>
  )
}
