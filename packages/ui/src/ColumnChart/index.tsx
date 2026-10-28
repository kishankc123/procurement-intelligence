import type { KeyboardEvent } from 'react'
import styles from './ColumnChart.module.css'

export type ColumnTone = 'good' | 'attention' | 'bad' | 'neutral'

export interface Column { id: string; label: string; value: number; tone: ColumnTone }

interface Props {
  columns: Column[]
  /** Column to highlight, e.g. the open group. */
  selectedId: string | null
  /** Click, Enter or Space on a column. */
  onSelect: (id: string) => void
  ariaLabel: string
  xTitle: string
  yTitle: string
}

const W = 520, H = 270
const PAD = { left: 52, right: 12, top: 20, bottom: 62 }
const cls = (name: string) => styles[name] ?? ''

/** Vertical bars on whole-number y ticks, one labelled bar per category. Each bar is a button; presentational only. */
export function ColumnChart({ columns, selectedId, onSelect, ariaLabel, xTitle, yTitle }: Props) {
  const maxValue = Math.max(...columns.map((c) => c.value), 1)
  const step = maxValue <= 5 ? 1 : Math.ceil(maxValue / 5)
  const top = Math.ceil(maxValue / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const band = plotW / Math.max(columns.length, 1)
  const barW = Math.min(band * 0.56, 72)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const key = (e: KeyboardEvent, id: string) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) } }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={ariaLabel} className={cls('svg')}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={cls('grid')} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={cls('tick')}>{t}</text>
        </g>
      ))}
      <text transform={`translate(14 ${PAD.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className={cls('title')}>{yTitle}</text>
      <text x={PAD.left + plotW / 2} y={H - 8} textAnchor="middle" className={cls('title')}>{xTitle}</text>
      {columns.map((c, i) => {
        const x = PAD.left + band * i + (band - barW) / 2
        const h = (c.value / top) * plotH
        const on = c.id === selectedId
        return (
          <g
            key={c.id} className={`${cls('col')} ${on ? cls('on') : ''}`} role="button" tabIndex={0} aria-pressed={on}
            aria-label={`${c.label}: ${c.value} ${c.value === 1 ? 'check' : 'checks'}`}
            onClick={() => onSelect(c.id)} onKeyDown={(e) => key(e, c.id)}
          >
            <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH + 28} className={cls('hit')} />
            <rect x={x} y={y(c.value)} width={barW} height={Math.max(h, 2)} rx={4} className={`${cls('bar')} ${cls(c.tone)}`} />
            <text x={x + barW / 2} y={y(c.value) - 6} textAnchor="middle" className={cls('value')}>{c.value}</text>
            <text x={x + barW / 2} y={H - PAD.bottom + 20} textAnchor="middle" className={cls('label')}>{c.label}</text>
          </g>
        )
      })}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className={cls('axis')} />
    </svg>
  )
}
