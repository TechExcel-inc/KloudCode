type Draft = Array<{ type: "text"; content: string; start: number; end: number }>

/** Draft text into the session composer (Cursor sendMessageToChat paste path — user then Send). */
export function draftComposer(set: (prompt: Draft) => void, text: string) {
  const content = text.trim()
  if (!content) return false
  set([{ type: "text", content, start: 0, end: content.length }])
  return true
}

export async function sendChat(input: { text: string; set: (prompt: Draft) => void }) {
  return draftComposer(input.set, input.text)
}
