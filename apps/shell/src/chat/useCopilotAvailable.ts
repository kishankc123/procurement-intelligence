import { useEffect, useState } from 'react'
import { COPILOT_URL } from '@pi/config'

/**
 * Asks the CopilotKit runtime whether it is there. It is only there when the assistant server has an OPENAI_API_KEY.
 * Until it answers, `checking`; when it does not, `off`, and the page keeps the rule-based chat.
 */
export function useCopilotAvailable(): 'checking' | 'on' | 'off' {
  const [state, setState] = useState<'checking' | 'on' | 'off'>('checking')
  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    fetch(`${COPILOT_URL}/info`, { signal: ctrl.signal })
      .then((r) => setState(r.ok ? 'on' : 'off'))
      .catch(() => setState('off'))
      .finally(() => clearTimeout(timer))
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [])
  return state
}
