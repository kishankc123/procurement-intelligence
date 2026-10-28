import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

const cls = (name: string) => styles[name] ?? ''

/** A grey placeholder block that pulses while data loads. Hidden from screen readers; the wrappers below announce "Loading". */
export function Skeleton({ width, height = 14, radius, style }: { width?: string | number; height?: string | number; radius?: string | number; style?: CSSProperties }) {
  return <span className={cls('block')} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />
}

function Loading({ children, label = 'Loading' }: { children: React.ReactNode; label?: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className={cls('wrap')}>{children}<span className={cls('sr')}>{label}…</span></div>
}

/** A few lines of text. The last line is shorter, like real text. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <Loading>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />)}
    </Loading>
  )
}

/** A table: a header row and a few body rows of cells. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Loading label="Loading table">
      <div className={cls('grid')} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, c) => <Skeleton key={`h${c}`} width="50%" height={12} />)}
        {Array.from({ length: rows * cols }, (_, i) => <Skeleton key={i} width={i % cols === 0 ? '80%' : '60%'} />)}
      </div>
    </Loading>
  )
}

/** A row of figure cards: a small title, a big number and a caption in each. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <Loading label="Loading figures">
      <div className={cls('cards')}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={cls('card')}><Skeleton width="55%" /><Skeleton width="35%" height={30} radius={8} /><Skeleton width="70%" height={12} /></div>
        ))}
      </div>
    </Loading>
  )
}

/** Whole-screen placeholder shown while a screen's code loads: a heading, a row of figures and a table. */
export function PageSkeleton() {
  return (
    <Loading label="Loading page">
      <div className={cls('page')}>
        <Skeleton width="38%" height={28} radius={8} />
        <Skeleton width="62%" />
        <div className={cls('cards')}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cls('card')}><Skeleton width="55%" /><Skeleton width="35%" height={30} radius={8} /><Skeleton width="70%" height={12} /></div>
          ))}
        </div>
        <div className={cls('card')}>
          <Skeleton width="25%" height={16} />
          <div className={cls('grid')} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {Array.from({ length: 20 }, (_, i) => <Skeleton key={i} width={i % 4 === 0 ? '80%' : '60%'} />)}
          </div>
        </div>
      </div>
    </Loading>
  )
}
