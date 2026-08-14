import type { Prompt } from "@/context/prompt"
import { DEFAULT_PROMPT } from "@/context/prompt"

/** Draft text into the session composer (Cursor sendMessageToChat draft path). */
export function draftComposer(set: (prompt: Prompt) => void, text: string) {
  const content = text.trim()
  if (!content) return false
  set([{ type: "text", content, start: 0, end: content.length }])
  return true
}

type Client = {
  session: {
    promptAsync: (input: {
      sessionID: string
      parts: Array<{ type: "text"; text: string }>
    }) => Promise<unknown>
  }
}

/** Draft then optionally auto-submit via session.promptAsync (best-effort like Cursor). */
export async function sendChat(input: {
  text: string
  set: (prompt: Prompt) => void
  client?: Client
  sessionID?: string
  auto?: boolean
}) {
  const content = input.text.trim()
  if (!content) return false
  draftComposer(input.set, content)
  if (!input.auto || !input.client || !input.sessionID) return false
  try {
    await input.client.session.promptAsync({
      sessionID: input.sessionID,
      parts: [{ type: "text", text: content }],
    })
    input.set(DEFAULT_PROMPT)
    return true
  } catch {
    return false
  }
}
