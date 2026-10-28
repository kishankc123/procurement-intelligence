import { API_BASE } from '@pi/config'

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Does a server answer at this address? A browser cannot read the status or body of another site's response,
 * so this only tells reachable (something answered) from unreachable (no answer within the time limit).
 */
export async function checkReachable(url: string, timeoutMs = 6000): Promise<'reachable' | 'unreachable'> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
    return 'reachable'
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}
