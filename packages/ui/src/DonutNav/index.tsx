import { useId, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import styles from './DonutNav.module.css'

export interface DonutSegment { id: string; label: string; color: string }

interface Props {
  segments: DonutSegment[]
  /** Segment to highlight (hovered, focused or pinned). */
  activeId: string | null
  /** Hover and keyboard focus. */
  onActiveChange: (id: string | null) => void
  /** Click, Enter or Space. */
  onSelect: (id: string) => void
  /** Short text in the hole of the donut. */
  centre?: ReactNode
  ariaLabel: string
  /** CSS max width of the donut, e.g. 'min(480px, 50vh)'. */
  size?: string
}

const CENTRE = 100
const OUTER = 100
const INNER = 58 // thick ring (42 units) around a hole large enough for the project wheel
const GAP_DEG = 4
const RC = 7 // corner radius of each slice, in user units
const LABEL_SIZE = 9.5 // user units; the label is centred on the ring using its cap height
const CAP = LABEL_SIZE * 0.72

function polar(radius: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [CENTRE + radius * Math.cos(rad), CENTRE + radius * Math.sin(rad)]
}

/** Annular slice with rounded corners. Each corner is a small circle of radius RC tangent to the radial edge and to the ring edge. */
function arcPath(start: number, end: number): string {
  const dOuter = (Math.asin(RC / (OUTER - RC)) * 180) / Math.PI // angle the outer corner eats into the slice
  const dInner = (Math.asin(RC / (INNER + RC)) * 180) / Math.PI
  const along = (rho: number) => Math.sqrt(rho * rho - RC * RC) // distance along the radial edge where the corner begins
  const p = (r: number, deg: number) => polar(r, deg).join(' ')
  const large = end - start - 2 * dOuter > 180 ? 1 : 0
  return [
    `M${p(along(OUTER - RC), start)}`,
    `A${RC} ${RC} 0 0 1 ${p(OUTER, start + dOuter)}`,
    `A${OUTER} ${OUTER} 0 ${large} 1 ${p(OUTER, end - dOuter)}`,
    `A${RC} ${RC} 0 0 1 ${p(along(OUTER - RC), end)}`,
    `L${p(along(INNER + RC), end)}`,
    `A${RC} ${RC} 0 0 1 ${p(INNER, end - dInner)}`,
    `A${INNER} ${INNER} 0 ${large} 0 ${p(INNER, start + dInner)}`,
    `A${RC} ${RC} 0 0 1 ${p(along(INNER + RC), start)}`,
    'Z',
  ].join(' ')
}

/** Arc used as a text baseline. Top slices run clockwise; bottom slices run counter-clockwise so the text never reads upside down. */
function labelPath(start: number, end: number, bottom: boolean): string {
  const mid = (OUTER + INNER) / 2
  if (!bottom) {
    // Glyphs sit outward of a clockwise baseline, so put the baseline half a cap height inside the ring's centre line.
    const r = mid - CAP / 2
    const [x1, y1] = polar(r, start)
    const [x2, y2] = polar(r, end)
    return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  const r = mid + CAP / 2 // glyphs sit inward of a counter-clockwise baseline
  const [x1, y1] = polar(r, end)
  const [x2, y2] = polar(r, start)
  return `M${x1} ${y1} A${r} ${r} 0 0 0 ${x2} ${y2}`
}

/** Donut of equal slices used as navigation. Each slice is a real button: hover or focus highlights it, click or Enter selects it. */
export function DonutNav({ segments, activeId, onActiveChange, onSelect, centre, ariaLabel, size }: Props) {
  const slice = 360 / Math.max(segments.length, 1)
  const uid = useId().replace(/:/g, '')

  const angles = (i: number) => {
    const start = -90 + i * slice + GAP_DEG / 2
    const end = -90 + (i + 1) * slice - GAP_DEG / 2
    return { start, end, mid: (start + end) / 2 }
  }
  const stateClass = (id: string) => (activeId === null ? '' : activeId === id ? styles.active : styles.dim)
  const popOut = (id: string, mid: number): CSSProperties | undefined => {
    if (activeId !== id) return undefined
    const [dx, dy] = polar(5, mid).map((v) => v - CENTRE) as [number, number]
    return { transform: `translate(${dx}px, ${dy}px)` }
  }

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) }
  }

  return (
    <div className={styles.wrap} style={size ? { maxWidth: size } : undefined}>
      <svg viewBox="-8 -8 216 216" role="group" aria-label={ariaLabel} className={styles.svg}>
        <defs>
          <radialGradient id={`${uid}-hole`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: '#3F73CC', stopOpacity: 0.28 }} />
            <stop offset="100%" style={{ stopColor: '#3F73CC', stopOpacity: 0 }} />
          </radialGradient>
          {segments.map((s) => (
            <linearGradient key={s.id} id={`${uid}-fill-${s.id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: `color-mix(in srgb, ${s.color} 72%, white)` }} />
              <stop offset="55%" style={{ stopColor: s.color }} />
              <stop offset="100%" style={{ stopColor: `color-mix(in srgb, ${s.color} 80%, black)` }} />
            </linearGradient>
          ))}
        </defs>
        {/* Decoration behind the slices: a soft glow in the hole, a fine inner ring and a slowly turning dotted orbit. */}
        <circle cx={CENTRE} cy={CENTRE} r={INNER - 2} fill={`url(#${uid}-hole)`} />
        <circle cx={CENTRE} cy={CENTRE} r={INNER - 4} className={styles.innerRing} />
        <circle cx={CENTRE} cy={CENTRE} r={OUTER + 5} className={styles.orbit} />
        {/* Layer 1: the coloured slices. They move and brighten on hover but never receive the mouse. */}
        {segments.map((s, i) => {
          const { start, end, mid } = angles(i)
          return (
            <g key={s.id} className={`${styles.seg} ${styles.slice} ${stateClass(s.id)}`} style={popOut(s.id, mid)}>
              <path d={arcPath(start, end)} fill={`url(#${uid}-fill-${s.id})`} />
            </g>
          )
        })}
        {/* Layer 2: the hit area, fixed in place. It is shown as a lighter tint of the slice colour that fades in on hover.
            If it moved with the slice, a cursor on the inner edge would leave it, the slice would move back, and the hover would flicker. */}
        {segments.map((s, i) => {
          const { start, end } = angles(i)
          return (
            <path
              key={s.id}
              className={`${styles.hit} ${activeId === s.id ? styles.hitActive : ''}`}
              style={{ '--tint': s.color } as CSSProperties}
              d={arcPath(start, end)}
              role="button"
              tabIndex={0}
              aria-label={s.label}
              onMouseEnter={() => onActiveChange(s.id)}
              onMouseLeave={() => onActiveChange(null)}
              onFocus={() => onActiveChange(s.id)}
              onBlur={() => onActiveChange(null)}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => onKey(e, s.id)}
            />
          )
        })}
        {/* Layer 3: labels, above the tint so they stay readable. They move with their slice. */}
        {segments.map((s, i) => {
          const { start, end, mid } = angles(i)
          const pathId = `${uid}-${s.id}`
          const bottom = Math.sin((mid * Math.PI) / 180) > 0
          return (
            <g key={s.id} className={`${styles.seg} ${stateClass(s.id)}`} style={popOut(s.id, mid)}>
              <path id={pathId} d={labelPath(start, end, bottom)} fill="none" />
              <text className={styles.label} textAnchor="middle">
                <textPath href={`#${pathId}`} startOffset="50%">{i + 1} · {s.label}</textPath>
              </text>
            </g>
          )
        })}
      </svg>
      {centre && <div className={styles.centre}>{centre}</div>}
    </div>
  )
}
