import { Component, type ReactNode } from 'react'
import { Button, Card, EmptyState, ProvenanceChip } from '@pi/ui'

/** The "nothing to show" state every card uses: a missing-information note, never a blank gap and never an estimate. */
export function MissingInfo({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <Card title={title} aside={<ProvenanceChip kind="missing" />}><EmptyState title="Missing information" text={text} action={action} /></Card>
}

interface State { failed: boolean }

/**
 * A crash guard around one card. If a card throws (bad or missing data, a remote that did not load), only that card is replaced by
 * a note; the conversation and the other cards keep working. "Try again" draws the card again.
 */
export class CardBoundary extends Component<{ name: string; children: ReactNode }, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(): State { return { failed: true } }
  componentDidCatch(error: unknown) { console.error(`Card "${this.props.name}" failed`, error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <MissingInfo
        title={this.props.name}
        text="This card could not be shown, so some information is missing. The rest of the conversation still works."
        action={<Button onClick={() => this.setState({ failed: false })}>Try again</Button>}
      />
    )
  }
}
