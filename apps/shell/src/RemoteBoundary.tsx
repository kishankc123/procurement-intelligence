import { Component, Suspense, type ReactNode } from 'react'
import { Button, Card, PageSkeleton } from '@pi/ui'

/**
 * True when the error looks like the remote's files could not be fetched (the feature app is not running, the page is out of date after a deployment, or
 * the network dropped), as opposed to the remote loading and then failing while it draws.
 */
export function isLoadFailure(error: unknown): boolean {
  const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`
  return /failed to fetch|dynamically imported module|error loading|loading (css )?chunk|importing a module script|networkerror|load failed|remoteentry|RUNTIME-00\d|\bfederation\b/i.test(text)
}

class Boundary extends Component<{ name: string; children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(`${this.props.name} failed`, error) }
  render() {
    const { error } = this.state
    if (!error) return <div key={this.state.attempt} style={{ display: 'contents' }}>{this.props.children}</div>
    const { name } = this.props
    const load = isLoadFailure(error)
    return (
      <Card title={`${name} could not load`}>
        {load
          ? <p>The {name} app could not be fetched. Locally, run <code>pnpm dev</code> in the project folder (it starts the main app and the four feature apps). On the hosted site, reload the page; if that does not help, the latest deployment may not have finished.</p>
          : <p>The {name} app was loaded, but it hit an error while drawing this view. Try again; if it keeps happening, the details below say what went wrong.</p>}
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {load ? <Button variant="primary" onClick={() => window.location.reload()}>Reload the page</Button> : <Button variant="primary" onClick={() => this.setState({ error: null, attempt: this.state.attempt + 1 })}>Try again</Button>}
        </p>
        <details><summary>Details</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(error.message || error).slice(0, 400)}</pre></details>
      </Card>
    )
  }
}

/** Each remote gets its own error boundary and Suspense fallback. */
export function RemoteBoundary({ name, children }: { name: string; children: ReactNode }) {
  return <Boundary name={name}><Suspense fallback={<PageSkeleton />}>{children}</Suspense></Boundary>
}
