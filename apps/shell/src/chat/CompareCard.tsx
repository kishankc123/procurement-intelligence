import { useState } from 'react'
import { COMPARE_METRICS, compareProjects, scopeLabel, useAllContracts, useAllReports, useAmendments, useCompletionReports, useProjects, type CompareMetricId } from '@pi/data'
import { Badge, Card, CompareBars, ProvenanceChip, ScatterPlot, Select } from '@pi/ui'
import { MissingInfo } from './CardBoundary'
import styles from './CompareCard.module.css'

const OPTIONS = COMPARE_METRICS.map((m) => ({ value: m.id, label: m.label }))
const label = (id: CompareMetricId) => COMPARE_METRICS.find((m) => m.id === id)!

/**
 * Two or more projects of the same kind side by side: a status line each, one bar chart per figure (price, suppliers, times extended, disbursed and so on) and a
 * scatter plot of any two figures against each other. All figures come from `compareProjects`; a value with no source is shown as Missing, never as zero.
 */
export function CompareProjectsCard({ projectIds }: { projectIds: string[] }) {
  const projects = useProjects()
  const contracts = useAllContracts()
  const amendments = useAmendments()
  const reports = useAllReports()
  const completion = useCompletionReports()
  const [xId, setXId] = useState<CompareMetricId>('committedUsd')
  const [yId, setYId] = useState<CompareMetricId>('disbursedPct')

  if ([projects, contracts, amendments, reports, completion].some((q) => q.isLoading)) return <Card state="loading">{null}</Card>
  if ([projects, contracts, amendments, reports, completion].some((q) => q.isError)) return <Card state="error">{null}</Card>
  const result = compareProjects({ projects: projects.data ?? [], contracts: contracts.data ?? [], amendments: amendments.data ?? [], reports: reports.data ?? [], completionReports: completion.data ?? [] }, projectIds)
  if (!result.ok) return <MissingInfo title="Compare projects" text={result.text} />

  const { rows, scope, unknown } = result
  const short = (r: (typeof rows)[number]) => (r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name)
  return (
    <div className={styles.card}>
      <Card title="Compare projects" aside={<span className={styles.row}><Badge tone={scope === 'real' ? 'low' : 'medium'}>{scope === 'real' ? 'Real data' : 'Mock data'}</Badge><ProvenanceChip kind="derived" detail={`n=${rows.length} projects`} /></span>}>
        <p className={styles.sub}>{rows.length} projects, {scopeLabel(scope)}. Bars start at zero. A figure with no source is Missing and is never filled in.{unknown.length > 0 && ` Not found: ${unknown.join(', ')}.`}</p>
        <table className={styles.table}>
          <thead><tr><th>Project</th><th>Country</th><th>Status</th><th>Contracts</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.projectId}>
              <td>{r.name}<br /><span className="mono">{r.projectId}</span></td><td>{r.country}</td><td>{r.status}</td><td className="mono">{r.n.contracts}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className={styles.bars}>
          {COMPARE_METRICS.map((m) => (
            <CompareBars key={m.id} title={m.label} unit={m.unit} bars={rows.map((r) => ({ id: r.projectId, label: short(r), value: r.values[m.id] }))} note={m.source} />
          ))}
        </div>
      </Card>
      <Card title="One figure against another" aside={<ProvenanceChip kind="derived" detail="one point per project" />}>
        <div className={styles.pickers}>
          <label>Horizontal<Select aria-label="Horizontal axis" value={xId} onValueChange={(v) => setXId(v as CompareMetricId)} options={OPTIONS} /></label>
          <label>Vertical<Select aria-label="Vertical axis" value={yId} onValueChange={(v) => setYId(v as CompareMetricId)} options={OPTIONS} /></label>
        </div>
        <ScatterPlot
          ariaLabel={`${label(yId).label} against ${label(xId).label}, one point per project`}
          xTitle={label(xId).label} yTitle={label(yId).label}
          items={rows.map((r) => ({ id: r.projectId, label: r.projectId, x: r.values[xId], y: r.values[yId] }))}
        />
      </Card>
    </div>
  )
}
