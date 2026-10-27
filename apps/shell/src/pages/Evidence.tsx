import { useState } from 'react'
import { can, whyDisabled } from '@pi/config'
import { useAuditLog, useConflicts, useCurrentUser, useRecommendations, useResolveConflict, useUiStore, type Citation } from '@pi/data'
import { Badge, Button, Card, EmptyState, ProvenanceChip } from '@pi/ui'
import { CitationChip, SourceDrawer } from '@pi/domain'
import styles from './ProjectData.module.css'

export function Evidence() {
  const { projectId } = useUiStore()
  const { role } = useCurrentUser()
  const conflicts = useConflicts()
  const recs = useRecommendations(projectId).data ?? []
  const audit = useAuditLog().data ?? []
  const resolve = useResolveConflict()
  const [open, setOpen] = useState<Citation | null>(null)
  const allowed = can(role, 'resolve_conflicts')
  const reason = allowed ? undefined : whyDisabled('resolve_conflicts')

  if (conflicts.isLoading) return <Card state="loading">{null}</Card>
  if (conflicts.isError) return <Card state="error">{null}</Card>
  const list = (conflicts.data ?? []).filter((c) => c.project_id === projectId)

  return (
    <div className={styles.page}>
      <div><h1>Evidence workbench</h1><p className={styles.sub}>Where two sources disagree, the rule applied and the decision are shown, never hidden.</p></div>

      {list.length === 0 ? <Card title="Conflicts"><EmptyState title="No conflicts for this project" /></Card> : list.map((c) => (
        <Card key={c.id} title={c.subject} aside={<Badge tone={c.status === 'open' ? 'medium' : 'low'}>{c.status}</Badge>}>
          <p className={styles.sub}>{c.type} · <span className="mono">{c.id}</span></p>
          <div className={styles.two}>
            {[c.left, c.right].map((side) => (
              <div key={side.label}>
                <strong>{side.label}</strong>
                <p>{side.value}</p>
                <ProvenanceChip kind={side.provenance} /> <CitationChip citation={side.citation} onOpen={setOpen} />
              </div>
            ))}
          </div>
          <p><strong>Rule applied:</strong> {c.rule_applied}</p>
          {c.status === 'open' ? (
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => resolve.mutate({ conflict: c, keep: 'public' })} disabledReason={reason}>Resolve: keep public value</Button>
              <Button onClick={() => resolve.mutate({ conflict: c, keep: 'entered' })} disabledReason={reason}>Resolve: keep entered value</Button>
            </div>
          ) : <p role="status"><strong>Resolution:</strong> {c.resolution}</p>}
          <h3>Provenance trail</h3>
          {audit.filter((a) => a.target === c.id || a.target === c.entered_ref).length === 0
            ? <p className={styles.sub}>No changes recorded against this conflict yet.</p>
            : <ul>{audit.filter((a) => a.target === c.id || a.target === c.entered_ref).map((a) => <li key={a.id}>{a.at.slice(0, 19).replace('T', ' ')} · {a.role.replace('_', ' ')} · {a.action}</li>)}</ul>}
        </Card>
      ))}

      <Card title="Grounding table" aside={<ProvenanceChip kind="derived" />}>
        {recs.length === 0 ? <EmptyState title="No recommendations for this project" /> : (
          <table className={styles.table}>
            <thead><tr><th>Claim</th><th>Citations</th><th>Status</th></tr></thead>
            <tbody>{recs.map((r) => (
              <tr key={r.id}><td>{r.title}<br /><span className="mono">{r.id}</span></td><td className="mono">{r.citations.length}</td>
                <td>{r.citations.length > 0 ? <Badge tone="low">Grounded</Badge> : <Badge tone="medium">Withheld</Badge>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <SourceDrawer citation={open} onClose={() => setOpen(null)} />
    </div>
  )
}
