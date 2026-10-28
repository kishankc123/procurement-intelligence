import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import styles from './WheelPicker.module.css'

export interface WheelItem { id: string; label: string }

interface Props {
  items: WheelItem[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
}

const WHEEL_STEP = 30 // wheel distance that counts as one step
const SWIPE_STEP = 24 // px of vertical finger travel per item
const WHEEL_LOCK_MS = 180 // trackpad inertia sends many events; move at most one item per lock

/** Vertical picker: the chosen item sits between two lines, its neighbours fade out above and below. Wheel, arrow keys and click all move it. */
export function WheelPicker({ items, value, onChange, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const index = Math.max(0, items.findIndex((i) => i.id === value))
  const latest = useRef({ index, items, onChange })
  latest.current = { index, items, onChange }
  const acc = useRef(0)
  const lockedUntil = useRef(0)

  // React attaches wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { index: i, items: list, onChange: change } = latest.current
      const next = i + Math.sign(e.deltaY)
      // At either end, let the page scroll instead of trapping the wheel.
      if (e.deltaY === 0 || next < 0 || next >= list.length) return
      e.preventDefault()
      if (Date.now() < lockedUntil.current) return
      acc.current += e.deltaY
      if (Math.abs(acc.current) < WHEEL_STEP) return
      acc.current = 0
      lockedUntil.current = Date.now() + WHEEL_LOCK_MS
      const target = list[next]
      if (target) change(target.id)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const move = (step: number) => {
    const target = items[index + step]
    if (target) onChange(target.id)
  }
  // Touch: drag the list with a finger. Mouse users have the wheel, the arrows and a click.
  const drag = useRef<{ y: number; captured: boolean } | null>(null)
  const onPointerDown = (e: PointerEvent) => { if (e.pointerType !== 'mouse') drag.current = { y: e.clientY, captured: false } }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (Math.abs(dy) < SWIPE_STEP) return
    // Capture only once a drag starts, so a plain tap on a neighbour still reaches that item's click handler.
    if (!d.captured) { e.currentTarget.setPointerCapture(e.pointerId); d.captured = true }
    move(dy < 0 ? 1 : -1)
    d.y = e.clientY
  }
  const endDrag = () => { drag.current = null }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  }

  return (
    <div className={styles.root}>
      <Arrow direction="up" disabled={index <= 0} onClick={() => move(-1)} />
      <div
        ref={ref}
        className={styles.picker}
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-activedescendant={items[index] ? `wheel-${items[index].id}` : undefined}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={`${styles.rule} ${styles.top}`} />
        <div className={`${styles.rule} ${styles.bottom}`} />
        <div className={styles.track} style={{ '--i': index } as CSSProperties}>
          {items.map((it, i) => {
            const distance = Math.abs(i - index)
            return (
              <div
                key={it.id}
                id={`wheel-${it.id}`}
                role="option"
                aria-selected={distance === 0}
                className={`${styles.item} ${distance === 0 ? styles.current : distance === 1 ? styles.near : styles.far}`}
                onClick={() => onChange(it.id)}
              >
                <span>{it.label}</span>
              </div>
            )
          })}
        </div>
      </div>
      <Arrow direction="down" disabled={index >= items.length - 1} onClick={() => move(1)} />
    </div>
  )
}

/** Small chevron above or below the wheel: shows the user that it scrolls, and can be clicked. Keyboard users use the arrow keys on the list. */
function Arrow({ direction, disabled, onClick }: { direction: 'up' | 'down'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.arrow} ${direction === 'up' ? styles.arrowUp : styles.arrowDown}`}
      disabled={disabled}
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={direction === 'up' ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
