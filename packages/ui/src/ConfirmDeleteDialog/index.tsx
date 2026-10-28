import { Trash2 } from '../icons'
import { Button } from '../Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import styles from './ConfirmDeleteDialog.module.css'

/** "Are you sure?" before anything is deleted. Yes is red (it destroys), No is green (it keeps things as they are). */
export function ConfirmDeleteDialog({ open, onOpenChange, what, detail, pending, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is being deleted, for example "plan". */
  what: string
  /** Name and ID of the item, shown under the question. */
  detail: string
  pending?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Are you sure you want to delete this {what}?</DialogTitle>
          <DialogDescription>{detail}. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className={styles.actions}>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>Yes, delete</Button>
          <Button variant="success" onClick={() => onOpenChange(false)}>No, keep it</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The trash icon followed by "Delete", used beside a plan or a tender draft. */
export function DeleteButton({ onClick, disabledReason, label = 'Delete' }: { onClick: () => void; disabledReason?: string; label?: string }) {
  return (
    <Button variant="danger" onClick={onClick} disabledReason={disabledReason}>
      <Trash2 size={16} aria-hidden="true" />{label}
    </Button>
  )
}
