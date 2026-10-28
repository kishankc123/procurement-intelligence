import { useState } from 'react'
import { useChunks, useDocs, useFetchSource, useMeta, useSources } from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip, Select } from '@pi/ui'
import styles from './ProjectData.module.css'

export function Knowledge() {
  const sources = useSources()
  const docs = useDocs().data ?? []
  const chunks = useChunks().data ?? []
  const asOf = useMeta().data?.as_of_date ?? ''
  const fetchSource = useFetchSource(asOf)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [docId, setDocId] = useState<string | null>(null)

  if (sources.isLoading) return <Card state="loading">{null}</Card>
  if (sources.isError) return <Card state="error">{null}</Card>

  const types = [...new Set(docs.map((d) => d.type))]
  const visible = docs.filter((d) => (!type || d.type === type) && `${d.title} ${d.doc_id}`.toLowerCase().includes(query.toLowerCase()))
  const selected = docs.find((d) => d.doc_id === docId)
  const docChunks = chunks.filter((c) => c.doc_id === docId)

  return (
    <div className={styles.page}>
      <div><h1>Knowledge base</h1><p className={styles.sub}>Source registry, ingested documents and their chunks. Fetching is simulated: nothing is downloaded.</p></div>

      <Card title="Source registry" aside={<Badge>Simulated fetch</Badge>}>
        <table className={styles.table}>
          <thead><tr><th>Source</th><th>Publisher</th><th>Kind</th><th>Status</th><th>Last fetched</th><th /></tr></thead>
          <tbody>{(sources.data ?? []).map((s) => (
            <tr key={s.id}>
              <td>{s.name}<br /><span className="mono">{s.id}</span></td><td>{s.publisher}</td><td>{s.kind}</td>
              <td>{s.status === 'fetched' ? <Badge tone="low">Fetched (simulated)</Badge> : <Badge>Registered</Badge>}</td>
              <td className="mono">{s.last_fetched ?? <ProvenanceChip kind="missing" detail="never" />}</td>
              <td><Button onClick={() => fetchSource.mutate({ id: s.id })} disabled={fetchSource.isPending}>Fetch</Button></td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      <div className={styles.two}>
        <Card title="Documents" aside={<ProvenanceChip kind="public" detail="mock titles" />}>
          <div className={styles.form}>
            <input aria-label="Search documents" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Select aria-label="Filter by type" value={type || 'all'} onValueChange={(v) => setType(v === 'all' ? '' : v)} options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: t }))]} />
          </div>
          {visible.length === 0 ? <EmptyState title="No documents match" /> : (
            <table className={styles.table}>
              <thead><tr><th>Title</th><th>Type</th><th>Date</th><th>Parse</th></tr></thead>
              <tbody>{visible.map((d) => (
                <tr key={d.doc_id}>
                  <td><button type="button" onClick={() => setDocId(d.doc_id)}>{d.title}</button><br /><span className="mono">{d.doc_id}</span></td>
                  <td>{d.type}</td><td className="mono">{d.date}</td><td>{d.parse_status}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>

        <Card title="Document detail">
          {!selected ? <EmptyState title="Select a document" text="Its chunks are listed here." /> : (
            <>
              <p><strong>{selected.title}</strong> · {selected.pages} pages · {selected.project_id}</p>
              {docChunks.length === 0 ? <EmptyState title="No chunks ingested for this document" /> : docChunks.map((c) => (
                <div key={c.chunk_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="mono">{c.chunk_id}</span> · p.{c.page} · {c.section_path} · {c.token_count} tokens · embedding {c.embedding_status}
                  <p className={styles.sub}>{c.text}</p>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
