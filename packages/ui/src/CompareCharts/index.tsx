import styles from './CompareCharts.module.css'

/** One series per compared item. The colour is only a help: every bar and point also carries its own text label. */
export interface ComparePoint { id: string; label: string; value: number | null }

const cls = (name: string) => styles[name] ?? ''
// Whole numbers from 1,000 up (money), one decimal below that (percentages, small counts).
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 1 })
const tickFmt = (n: number) => n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const SERIES = ['s0', 's1', 's2', 's3', 's4']

/** Largest tick step of 1, 2 or 5 times a power of ten that gives about four steps up to `max`. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

/**
 * One metric as a bar per item on a zero-based scale, each with its value written at the end. An item with no value has no bar and says Missing,
 * so a gap is never drawn as a zero. Presentational only.
 */
export function CompareBars({ title, unit, bars, note }: { title: string; unit: string; bars: ComparePoint[]; note?: string }) {
  const max = Math.max(...bars.map((b) => b.value ?? 0), 0)
  return (
    <figure className={cls('bars')}>
      <figcaption>{title}</figcaption>
      <ul aria-label={title}>
        {bars.map((b, i) => (
          <li key={b.id}>
            <span className={cls('name')} title={b.label}>{b.label}</span>
            {b.value === null
              ? <span className={cls('missing')}>Missing</span>
              : (
                <>
                  <span className={cls('track')} aria-hidden="true"><span className={`${cls('fill')} ${cls(SERIES[i % SERIES.length]!)}`} style={{ width: `${max > 0 ? Math.max((b.value / max) * 100, b.value > 0 ? 1.5 : 0) : 0}%` }} /></span>
                  <span className={cls('value')}>{fmt(b.value)}{unit === '%' ? '%' : ''}</span>
                </>
              )}
          </li>
        ))}
      </ul>
      {note && <p className={cls('note')}>{note}</p>}
    </figure>
  )
}

export interface ScatterItem { id: string; label: string; x: number | null; y: number | null }

const W = 520, H = 300
const PAD = { left: 64, right: 24, top: 16, bottom: 52 }

/**
 * Two metrics against each other, one labelled point per item, both axes from zero. An item missing either value is left off the plot and listed under it,
 * so nothing is estimated. Presentational only.
 */
export function ScatterPlot({ items, xTitle, yTitle, ariaLabel }: { items: ScatterItem[]; xTitle: string; yTitle: string; ariaLabel: string }) {
  const plotted = items.filter((p): p is ScatterItem & { x: number; y: number } => p.x !== null && p.y !== null)
  const left = items.filter((p) => p.x === null || p.y === null)
  const xt = niceTicks(Math.max(...plotted.map((p) => p.x), 0))
  const yt = niceTicks(Math.max(...plotted.map((p) => p.y), 0))
  const xMax = xt[xt.length - 1] ?? 1, yMax = yt[yt.length - 1] ?? 1
  const px = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right)
  const py = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom)
  return (
    <figure className={cls('scatter')}>
      {plotted.length === 0 ? <p className={cls('missingAll')}>Missing: none of these projects has both values, so there is nothing to plot.</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} width="100%">
          {xt.map((t) => <g key={`x${t}`}><line x1={px(t)} x2={px(t)} y1={py(0)} y2={py(yMax)} className={cls('grid')} /><text x={px(t)} y={H - PAD.bottom + 16} textAnchor="middle" className={cls('tick')}>{tickFmt(t)}</text></g>)}
          {yt.map((t) => <g key={`y${t}`}><line x1={px(0)} x2={px(xMax)} y1={py(t)} y2={py(t)} className={cls('grid')} /><text x={PAD.left - 8} y={py(t) + 4} textAnchor="end" className={cls('tick')}>{tickFmt(t)}</text></g>)}
          <text x={(PAD.left + W - PAD.right) / 2} y={H - 8} textAnchor="middle" className={cls('axis')}>{xTitle}</text>
          <text transform={`translate(14 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle" className={cls('axis')}>{yTitle}</text>
          {plotted.map((p, i) => {
            const flip = px(p.x) > W - PAD.right - 110
            return (
              <g key={p.id}>
                <circle cx={px(p.x)} cy={py(p.y)} r={6} className={`${cls('dot')} ${cls(SERIES[items.indexOf(p) % SERIES.length]!)}`} tabIndex={0} aria-label={`${p.label}: ${xTitle} ${fmt(p.x)}, ${yTitle} ${fmt(p.y)}`}><title>{`${p.label}: ${fmt(p.x)}, ${fmt(p.y)}`}</title></circle>
                <text x={px(p.x) + (flip ? -10 : 10)} y={py(p.y) + 4} textAnchor={flip ? 'end' : 'start'} className={cls('pointLabel')} data-i={i}>{p.label}</text>
              </g>
            )
          })}
        </svg>
      )}
      {left.length > 0 && <figcaption className={cls('note')}>Left off, a value is missing: {left.map((p) => p.label).join(', ')}.</figcaption>}
    </figure>
  )
}
