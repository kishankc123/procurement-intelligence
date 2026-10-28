import { validityCoverage, type Plan, type TenderDraft } from '@pi/data'
import { Badge } from '@pi/ui'
import styles from './ValidityCoverage.module.css'

/**
 * Draws the one clause that is easiest to get wrong: do bids stay valid until the planned signing?
 * The bar is the draft's bid validity counted from bid opening; the vertical line is the planned signing.
 */
export function ValidityCoverage({ plan, draft }: { plan: Plan; draft: Pick<TenderDraft, 'bid_validity_days'> }) {
  const c = validityCoverage(plan, draft)
  const span = Math.max(c.needed, c.validityDays, 1) * 1.1
  const pct = (days: number) => `${(days / span) * 100}%`
  const covered = c.shortBy === 0

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} role="img" aria-label={`Bid validity ${c.validityDays} days from bid opening ${c.opening}; contract signing is planned ${c.needed} days after bid opening on ${c.signing}. ${covered ? (c.spare > 0 ? `${c.spare} days to spare.` : 'Covers it exactly.') : `Bids expire ${c.shortBy} days before signing.`}`}>
        <span className={`${styles.bar} ${covered ? '' : styles.barShort}`} style={{ width: pct(c.validityDays) }}>{c.validityDays} days</span>
        {c.shortBy > 0 && <span className={styles.gap} style={{ left: pct(c.validityDays), width: `calc(${pct(c.needed)} - ${pct(c.validityDays)})` }} />}
        {c.spare > 0 && <span className={styles.spare} style={{ left: pct(c.needed), width: `calc(${pct(c.validityDays)} - ${pct(c.needed)})` }} />}
        <span className={styles.sign} style={{ left: pct(c.needed) }} />
        <span className={styles.signLabel} style={{ left: pct(c.needed) }}>Signing · day {c.needed}</span>
        <span className={styles.below} style={{ left: 0 }}>Day 0 · bid opening {c.opening}</span>
        <span className={styles.below} style={{ left: pct(c.needed), transform: 'translateX(calc(-100% - 8px))', top: 66 }}>Day {c.needed} · {c.signing}</span>
      </div>
      <ul className={styles.legend} aria-label="Legend">
        <li><span className={`${styles.sw} ${covered ? styles.swGood : styles.swWarn}`} aria-hidden="true" />Bid validity</li>
        <li><span className={styles.swLine} aria-hidden="true" />Planned signing</li>
        <li><span className={styles.swGap} aria-hidden="true" />Uncovered days</li>
        <li><span className={styles.swSpare} aria-hidden="true" />Days to spare</li>
      </ul>
      <p className={styles.verdict}>
        {covered
          ? <><Badge tone="low">Covered</Badge> {c.spare > 0 ? `${c.spare} days to spare` : 'exactly'}</>
          : <><Badge tone="high">Short by {c.shortBy} days</Badge> Bids expire {c.validityEnd}</>}
      </p>
    </div>
  )
}
