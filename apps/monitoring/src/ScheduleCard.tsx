import { useState } from 'react'
import { Link } from 'react-router'
import { THRESHOLDS } from '@pi/config'
import {
  STATUS_LABEL, projectPhase, scheduleRange, scheduleRows, useMeta, usePlan, useScheduleItems,
  type Project, type ScheduleStatus,
} from '@pi/data'
import { Badge, Card, EmptyState, Gantt, ProvenanceChip, type GanttTone } from '@pi/ui'
import { FeedbackWidget } from '@pi/domain'
import styles from './ScheduleCard.module.css'

const TONE: Record<ScheduleStatus, GanttTone> = { complete: 'good', on_track: 'good', behind: 'attention', overdue: 'bad', upcoming: 'neutral', no_progress: 'neutral' }
const BADGE = { good: 'low', attention: 'medium', bad: 'high', neutral: 'neutral' } as const

/**
 * The selected project's schedule inside Monitoring: tender rows from its plans plus mock operational items,
 * each flagged on track, behind or overdue against the data date. Owns only the selected-bar state.
 */
export function ScheduleCard({ project }: { project: Project }) {
  const items = useScheduleItems()
  const plans = usePlan(project.project_id).data ?? []
  const asOf = useMeta().data?.as_of_date
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!asOf) return <Card title="Project schedule" state="loading">{null}</Card>
  if (items.isError) return <Card title="Project schedule" state="error">{null}</Card>

  const rows = scheduleRows((items.data ?? []).filter((i) => i.project_id === project.project_id), plans, asOf)
  const range = scheduleRange(rows, asOf)
  const selected = rows.find((r) => r.id === selectedId) ?? null
  const flagged = rows.filter((r) => r.status === 'behind' || r.status === 'overdue').length

  return (
    <Card title="Project schedule" aside={<ProvenanceChip kind="derived" detail={`n=${rows.length}`} />}>
      <div className={styles.stack}>
        <p className={styles.sub}>
          Phase: <strong>{projectPhase(project, rows, asOf)}</strong> · {flagged} behind or overdue as of <span className="mono">{asOf}</span>. Tender rows come from your plans; works, supplies and manpower rows are <Badge>Mock</Badge> operational records.
          A bar is flagged behind when recorded progress trails the share of its time already used by more than {THRESHOLDS.scheduleLagPoints} points.
        </p>
        {rows.length === 0 ? (
          <EmptyState title="No schedule items for this project" text="Add a plan in Planning to see its tender stages here." action={<Link to="/planning">Open Planning</Link>} />
        ) : (
          <>
            <Gantt
              ariaLabel={`Schedule of ${project.project_name}`}
              rows={rows.map((r) => ({
                id: r.id, label: r.name, sublabel: r.group, statusText: STATUS_LABEL[r.status], start: r.start, end: r.end,
                progress: r.progress, milestone: r.milestone, tone: TONE[r.status],
                ariaLabel: `${r.name}, ${r.group}, ${r.start} to ${r.end}, ${STATUS_LABEL[r.status]}${r.progress !== null ? `, ${r.progress}% recorded` : ''}`,
              }))}
              rangeStart={range.start} rangeEnd={range.end} asOf={asOf}
              selectedId={selected?.id ?? null} onSelect={setSelectedId}
              legend={[{ tone: 'good', label: 'Complete or on track' }, { tone: 'attention', label: 'Behind' }, { tone: 'bad', label: 'Overdue' }, { tone: 'neutral', label: 'Not started or no progress recorded' }]}
            />
            {selected ? (
              <div className={styles.detail} aria-live="polite">
                <div className={styles.row}>
                  <strong>{selected.name}</strong>
                  <Badge tone={BADGE[TONE[selected.status]]}>{STATUS_LABEL[selected.status]}</Badge>
                  <ProvenanceChip kind="entered" detail={selected.source === 'plan' ? 'from your plan' : 'mock record'} />
                  <ProvenanceChip kind="derived" detail="status" />
                </div>
                <p>{selected.group} · {selected.milestone ? `milestone on ${selected.start}` : `${selected.start} to ${selected.end}`}</p>
                {!selected.milestone && (
                  <p className={styles.sub}>
                    {selected.expected === null ? 'Not started at the date of the data, so no progress is expected yet.'
                      : selected.progress === null ? `${selected.expected}% of the time has been used. No progress is recorded for this item.`
                        : `${selected.expected}% of the time has been used and ${selected.progress}% is recorded${selected.gap !== null && selected.gap > 0 ? `: ${selected.gap} points behind` : ''}.`}
                  </p>
                )}
                {selected.source === 'plan' && <p className={styles.sub}>Change these dates in <Link to="/planning">Planning</Link>.</p>}
              </div>
            ) : <p className={styles.sub}>Hover, focus or click a bar for its dates, progress and how its status was worked out.</p>}
            <table className={styles.srOnly}>
              <caption>Schedule items of {project.project_name}</caption>
              <thead><tr><th>Item</th><th>Group</th><th>Start</th><th>End</th><th>Recorded progress</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><th>{r.name}</th><td>{r.group}</td><td>{r.start}</td><td>{r.end}</td><td>{r.progress === null ? 'none recorded' : `${r.progress}%`}</td><td>{STATUS_LABEL[r.status]}</td></tr>)}</tbody>
            </table>
          </>
        )}
        <div className={styles.feedback}>
          <span>Was this schedule view useful?</span>
          <FeedbackWidget targetId={`AI-LAYER-schedule-${project.project_id}`} />
        </div>
      </div>
    </Card>
  )
}
