import { Component, Suspense, type ReactNode } from 'react'
import { Card } from '@pi/ui'

class Boundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <Card title={`${this.props.name} could not load`}><p>The {this.props.name} remote is not reachable. Start it with <code>pnpm dev</code>.</p></Card>
  }
}

/** Each remote gets its own error boundary and Suspense fallback. */
export function RemoteBoundary({ name, children }: { name: string; children: ReactNode }) {
  return <Boundary name={name}><Suspense fallback={<Card state="loading">{null}</Card>}>{children}</Suspense></Boundary>
}
