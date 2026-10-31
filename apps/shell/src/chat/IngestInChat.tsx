import { IngestCandidates } from './IngestCard'
import { useSendToChat } from './useSendToChat'

/** The ingest card as the chat draws it. It asks for "send a message" itself, each time it is drawn, so its buttons reach the current chat (see useSendToChat). */
export function IngestInChat({ result }: { result: string | undefined }) {
  const send = useSendToChat()
  return <IngestCandidates result={result} onSend={send} />
}
