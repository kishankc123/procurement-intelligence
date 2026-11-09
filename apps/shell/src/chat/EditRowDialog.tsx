import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pi/ui'
import styles from './OnRecordCards.module.css'

export interface EditField { key: string; label: string; type?: 'text' | 'date'; /** Cannot be left empty (the stored row needs it). */ required?: boolean }

/**
 * A small form for correcting one row of past data. Every field is plain text (or a date), saved exactly as typed; an empty field is saved as "not stated"
 * (null), never as a guess. The caller decides what saving does.
 */
export function EditRowDialog<T extends Record<string, unknown>>({ open, onOpenChange, title, description, fields, row, onSave, pending }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; fields: EditField[]; row: T; pending: boolean; onSave: (next: T) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  useEffect(() => { if (open) setDraft(Object.fromEntries(fields.map((f) => [f.key, String(row[f.key] ?? '')]))) }, [open, row, fields])
  const missing = fields.some((f) => f.required && !draft[f.key]?.trim())
  const submit = () => onSave({ ...row, ...Object.fromEntries(fields.map((f) => [f.key, draft[f.key]?.trim() ? draft[f.key]!.trim() : null])) })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); submit() }}>
          {fields.map((f) => (
            <label key={f.key}>{f.label}
              <input type={f.type ?? 'text'} required={f.required} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            </label>
          ))}
          <div className={styles.actions}>
            <Button type="submit" variant="success" disabled={pending || missing}>Save changes</Button>
            <Button type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
