import { ASSISTANT_BASE } from '@pi/config'
import { AssistantReply, type AssistantRequest } from './assistant'

/** Sends one chat message to the assistant server and checks the reply has the expected shape. */
export async function askAssistant(request: AssistantRequest): Promise<AssistantReply> {
  let res: Response
  try {
    res = await fetch(`${ASSISTANT_BASE}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
  } catch {
    throw new Error('The assistant server did not answer. Start it with ./run.sh, or with pnpm assistant.')
  }
  if (!res.ok) throw new Error(`The assistant server answered with an error (${res.status}).`)
  const parsed = AssistantReply.safeParse(await res.json())
  if (!parsed.success) throw new Error('The assistant server sent a reply this app does not understand.')
  return parsed.data
}
