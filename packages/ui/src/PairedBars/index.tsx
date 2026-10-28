import type { ReactNode } from 'react'
import { InfoTip } from '../InfoTip'
import styles from './PairedBars.module.css'

export type PairTone = 'good' | 'attention' | 'bad' | 'neutral'

export interface PairRow {
  id: string
  label: string
  /** Value of the draft. */
  draft: number
  /** Value it is compared with. */
  reference: number
  unit: string
  /** What the reference is, e.g. "Your plan". */
  referenceLabel: string
  /** How the draft fared: it sets the colour of the draft bar. */
  tone: PairTone
  /** What the result means: opens from the icon next to the difference. */
  info?: ReactNode
}

/** A clause with nothing to draw yet: shown as an empty row with the reason and, when data can fix it, an action. */
export interface PairGap {
  id: string
  label: string
  referenceLabel: string
  reason: string
  action?: ReactNode
}

const cls = (name: string) => styles[name] ?? ''
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`

const TONE_MEANING: Record<PairTone, string> = {
  good: 'Draft meets the reference',
  attention: 'Draft needs a look',
  bad: 'Draft fails',
  neutral: 'Draft, for information',
}

/**
 * For each clause, two labelled bars on the same zero-based scale: the draft on top and its reference below,
 * each with its value written at the end. A legend says what the bars and colours mean.
 * Each row has its own scale, because the rows use different units. Presentational only.
 */
export function PairedBars({ rows, gaps = [], ariaLabel }: { rows: PairRow[]; gaps?: PairGap[]; ariaLabel: string }) {
  const tones = (['good', 'attention', 'bad', 'neutral'] as PairTone[]).filter((t) => rows.some((r) => r.tone === t))

  return (
    <div className={cls('root')}>
      <ul className={cls('legend')} aria-label="Legend">
        {tones.map((t) => <li key={t}><span className={`${cls('swatch')} ${cls(t)}`} aria-hidden="true" />{TONE_MEANING[t]}</li>)}
        <li><span className={`${cls('swatch')} ${cls('ref')}`} aria-hidden="true" />Reference</li>
        {gaps.length > 0 && <li><span className={`${cls('swatch')} ${cls('blank')}`} aria-hidden="true" />Nothing to compare yet</li>}
      </ul>
      <p className={cls('hint')}>Top bar: your draft. Bottom bar: its reference. Each row has its own scale from zero.</p>
      <ul className={cls('list')} aria-label={ariaLabel}>
        {rows.map((r) => {
          const max = Math.max(r.draft, r.reference, 1) * 1.3
          const delta = Math.round((r.draft - r.reference) * 10) / 10
          return (
            <li key={r.id} className={cls('row')}>
              <div className={cls('label')}><strong>{r.label}</strong><span className={cls('sub')}>vs {r.referenceLabel}</span></div>
              <div className={cls('plot')}>
                <div className={cls('pair')} role="img" aria-label={`${r.label}: draft ${fmt(r.draft)} ${r.unit}; ${r.referenceLabel} ${fmt(r.reference)} ${r.unit}; difference ${signed(delta)} ${r.unit}. ${TONE_MEANING[r.tone]}.`}>
                  <span className={cls('tag')}>Draft</span>
                  <div className={cls('track')}>
                    <span className={`${cls('bar')} ${cls(r.tone)}`} style={{ width: `${(r.draft / max) * 100}%` }} />
                    <span className={cls('value')} style={{ left: `calc(${(r.draft / max) * 100}% + 8px)` }}>{fmt(r.draft)} {r.unit}</span>
                  </div>
                  <span className={cls('tag')}>Reference</span>
                  <div className={cls('track')}>
                    <span className={`${cls('bar')} ${cls('ref')}`} style={{ width: `${(r.reference / max) * 100}%` }} />
                    <span className={cls('value')} style={{ left: `calc(${(r.reference / max) * 100}% + 8px)` }}>{fmt(r.reference)} {r.unit}</span>
                  </div>
                </div>
                <p className={cls('diff')}>
                  Difference <strong className="mono">{signed(delta)} {r.unit}</strong>
                  {r.info && <InfoTip tone={r.tone} label={`What ${r.label} means`}>{r.info}</InfoTip>}
                </p>
              </div>
            </li>
          )
        })}
        {gaps.map((g) => (
          <li key={g.id} className={cls('row')}>
            <div className={cls('label')}><strong>{g.label}</strong><span className={cls('sub')}>vs {g.referenceLabel}</span></div>
            <div className={cls('gap')}>
              <span>{g.reason}</span>
              {g.action}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
