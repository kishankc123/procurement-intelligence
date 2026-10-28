import { Fragment, useState } from 'react'
import { SPEC_STATUS_LABEL, type Citation, type SpecCheck, type SpecStatus } from '@pi/data'
import { Badge, ColumnChart, EmptyState, ProvenanceChip, TableScroll, type ColumnTone } from '@pi/ui'
import { CitationChip } from '@pi/domain'
import styles from './SpecGroups.module.css'

// Order of the groups in the chart and the table.
const GROUPS: SpecStatus[] = ['pass', 'fail', 'warn', 'not_checkable']
const TONE: Record<SpecStatus, ColumnTone> = { pass: 'good', fail: 'bad', warn: 'attention', not_checkable: 'neutral' }
const BADGE = { pass: 'low', fail: 'high', warn: 'medium', not_checkable: 'neutral' } as const
const MEANING: Record<SpecStatus, string> = {
  pass: 'The rule is met.',
  fail: 'The rule is broken: fix the draft or the plan.',
  warn: 'Worth a look: not a failure, but outside what the guidance or the plan expects.',
  not_checkable: 'No source here holds the number, so nothing was compared and nothing is estimated.',
}

/**
 * Specification checks as a bar chart of results (y: number of checks, x: result) and a table with one row per result.
 * Click a bar or a row to open the checks in that group, each with its rule, the numbers compared and its evidence.
 */
export function SpecGroups({ checks, onCite }: { checks: SpecCheck[]; onCite: (c: Citation) => void }) {
  const byStatus = (s: SpecStatus) => checks.filter((c) => c.status === s)
  // Until someone picks a group, show the most serious one that has anything in it. undefined means not picked yet,
  // so this still works when the checks arrive after the first render.
  const first = (['fail', 'warn'] as SpecStatus[]).find((s) => byStatus(s).length > 0) ?? null
  const [picked, setOpen] = useState<SpecStatus | null | undefined>(undefined)
  const open = picked === undefined ? first : picked
  const toggle = (s: SpecStatus) => { if (byStatus(s).length > 0) setOpen(open === s ? null : s) }

  return (
    <div className={styles.chartRow}>
      <ColumnChart
        ariaLabel="Specification checks by result"
        xTitle="Result" yTitle="Number of checks"
        selectedId={open}
        onSelect={(id) => { const s = id as SpecStatus; if (byStatus(s).length > 0) setOpen(open === s ? null : s); else setOpen(null) }}
        columns={GROUPS.map((s) => ({ id: s, label: SPEC_STATUS_LABEL[s], value: byStatus(s).length, tone: TONE[s] }))}
      />
      <TableScroll>
        <table className={styles.table}>
          <thead><tr><th>Result</th><th>Checks</th><th>Which clauses</th></tr></thead>
          <tbody>
            {GROUPS.map((s) => {
              const list = byStatus(s)
              const isOpen = open === s && list.length > 0
              return (
                <Fragment key={s}>
                  <tr
                    className={`${styles.group} ${isOpen ? styles.groupOn : ''} ${list.length === 0 ? styles.empty : ''}`}
                    tabIndex={list.length > 0 ? 0 : -1} aria-expanded={list.length > 0 ? isOpen : undefined}
                    onClick={() => toggle(s)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s) } }}
                  >
                    <td><span className={`${styles.caret} ${isOpen ? styles.caretOn : ''}`} aria-hidden="true">▸</span><Badge tone={BADGE[s]}>{SPEC_STATUS_LABEL[s]}</Badge></td>
                    <td className="mono">{list.length}</td>
                    <td>{list.length === 0 ? <span className={styles.sub}>None</span> : list.map((c) => c.clause).join(', ')}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={3} className={styles.expandedCell}>
                        <div className={styles.expanded}>
                          <p className={styles.sub}>{MEANING[s]}</p>
                          <TableScroll>
                            <table className={styles.table}>
                              <thead><tr><th>Clause and rule</th><th>Your draft</th><th>Compared with</th><th>What it found</th></tr></thead>
                              <tbody>
                                {list.map((c) => (
                                  <tr key={c.id}>
                                    <td><strong>{c.clause}</strong><p className={styles.rule}>{c.rule}</p></td>
                                    <td className="mono">{c.draftValue}</td>
                                    <td>{c.reference ?? <ProvenanceChip kind="missing" />}</td>
                                    <td>{c.detail}{c.citations.length > 0 && <div>{c.citations.map((cit) => <span key={cit.ref_id}><CitationChip citation={cit} onOpen={onCite} />{' '}</span>)}</div>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </TableScroll>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableScroll>
      {checks.length === 0 && <EmptyState title="No checks yet" />}
    </div>
  )
}
