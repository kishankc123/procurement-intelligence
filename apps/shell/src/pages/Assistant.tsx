import { useState } from 'react'
import { Link } from 'react-router'
import { LIFECYCLE_STEPS } from '@pi/config'
import { DonutNav, Sparkles } from '@pi/ui'
import { WorldBackdrop } from '@pi/domain'
import { STEP_COLOR } from '../stepColors'
import styles from './Home.module.css'

/**
 * "Learn about the assistant": the four lifecycle steps as a donut. Hovering a step previews what it does; clicking (or tapping) one pins its details. Nothing
 * here opens the chat: that is what Get started is for.
 */
export function Assistant() {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const shownId = hoverId ?? pickedId
  const active = LIFECYCLE_STEPS.find((s) => s.id === shownId) ?? null
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <WorldBackdrop />
      <h1 id="hero-title" className={styles.heroTitle}>What the assistant sets up</h1>
      <p className={styles.sub}>Four lifecycle steps on one traceable record. <span className={styles.hoverOnly}>Hover a step to preview what it does, or click one to keep its details open.</span><span className={styles.touchOnly}>Tap a step to see what it does.</span></p>
      <DonutNav
        ariaLabel="Project lifecycle"
        size="var(--donut)"
        segments={LIFECYCLE_STEPS.map((s) => ({ id: s.id, label: s.label, color: STEP_COLOR[s.id] ?? 'var(--primary)' }))}
        activeId={shownId}
        onActiveChange={setHoverId}
        onSelect={(id) => setPickedId(id === pickedId ? null : id)}
      />
      <div className={styles.info} style={{ borderTopColor: active ? STEP_COLOR[active.id] : undefined }} aria-live="polite">
        {active ? (
          <>
            <h2 className={styles.infoTitle}>{active.label}</h2>
            <p className={styles.infoText}>{active.summary}</p>
          </>
        ) : <p className={styles.infoText}>Hover or click a step to see what it does.</p>}
      </div>
      <Link to="/chat" className={styles.cta}><Sparkles size={16} aria-hidden="true" />Get started with ProcureIntel</Link>
    </section>
  )
}
