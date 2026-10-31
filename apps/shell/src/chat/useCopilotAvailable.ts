import { useEffect, useState } from 'react'
import { COPILOT_URL } from '@pi/config'

export interface CopilotAvailability {
  state: 'checking' | 'on' | 'off'
  /** Why the model chat is off, in a sentence. Null while checking or when it is on. */
  reason: string | null
}

/** Turns the runtime's answer into a sentence. Our function sends `{ error, detail }` as JSON; anything else is described by its status. */
async function explain(res: Response): Promise<string> {
  const said = await res.json().then((b: { error?: string; detail?: string }) => [b.error, b.detail].filter(Boolean).join(' ')).catch(() => '')
  if (said) return said
  return res.status === 404 ? 'the CopilotKit endpoint was not found (404)' : `the CopilotKit endpoint answered with an error (${res.status})`
}

/**
 * Asks the CopilotKit runtime whether it is there. It is only there when the assistant server has an OPENAI_API_KEY.
 * Until it answers, `checking`; when it does not, `off` with the reason, and the page keeps the rule-based chat.
 */
// The answer is remembered for this page load, so coming back to the chat from another page does not wait (or show the loading picture) again.
let known: CopilotAvailability | null = null

export function useCopilotAvailable(): CopilotAvailability {
  const [value, setValueState] = useState<CopilotAvailability>(known ?? { state: 'checking', reason: null })
  const setValue = (v: CopilotAvailability) => { known = v; setValueState(v) }
  useEffect(() => {
    if (known) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    fetch(`${COPILOT_URL}/info`, { signal: ctrl.signal })
      .then(async (r) => setValue(r.ok ? { state: 'on', reason: null } : { state: 'off', reason: await explain(r) }))
      .catch(() => setValue({ state: 'off', reason: 'the assistant server did not answer' }))
      .finally(() => clearTimeout(timer))
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])
  return value
}
