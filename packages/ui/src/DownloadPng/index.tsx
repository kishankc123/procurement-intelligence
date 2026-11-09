import { useState, type RefObject } from 'react'
import { toPng } from 'html-to-image'
import { Button } from '../Button'

/** Put this attribute on anything that should not appear in the picture (the download button itself, remove buttons). */
export const EXPORT_IGNORE = 'data-export-ignore'

const fileSafe = (name: string) => name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'export'

/**
 * Draws a part of the page as a PNG and saves it. Scroll areas inside it (the Gantt chart, long tables) are opened out for the picture so the
 * whole content is captured, not only the part in view, and put back afterwards.
 */
export async function exportNodeAsPng(node: HTMLElement, name: string) {
  const undo: (() => void)[] = []
  for (const el of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
    const cs = getComputedStyle(el)
    if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) || cs.maxHeight !== 'none') {
      const { overflow, maxHeight } = el.style
      el.style.overflow = 'visible'
      el.style.maxHeight = 'none'
      undo.push(() => { el.style.overflow = overflow; el.style.maxHeight = maxHeight })
    }
  }
  try {
    const background = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff'
    const url = await toPng(node, {
      pixelRatio: 2, cacheBust: true, backgroundColor: background,
      width: node.scrollWidth, height: node.scrollHeight,
      filter: (n) => !(n instanceof HTMLElement && n.hasAttribute(EXPORT_IGNORE)),
    })
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileSafe(name)}.png`
    a.click()
  } finally {
    undo.forEach((fn) => fn())
  }
}

/** A small button that saves what `targetRef` points at as a PNG. Left out of the picture itself. */
export function DownloadPng({ targetRef, name, label = 'Download PNG' }: { targetRef: RefObject<HTMLElement | null>; name: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const run = async () => {
    if (!targetRef.current) return
    setState('busy')
    try { await exportNodeAsPng(targetRef.current, name); setState('idle') } catch { setState('error') }
  }
  return (
    <Button onClick={run} disabled={state === 'busy'} {...{ [EXPORT_IGNORE]: '' }} title={state === 'error' ? 'The picture could not be made. Try again.' : `Save ${name} as a PNG picture`}>
      {state === 'busy' ? 'Saving…' : state === 'error' ? 'Retry PNG' : label}
    </Button>
  )
}
