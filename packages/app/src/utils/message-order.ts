import type { Message } from "@opencode-ai/sdk/v2/client"

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Chronological message order. Do not sort messages by id alone — ids wrapped in 2026-08. */
export function msgCmp(a: Message, b: Message) {
  const ac = a.time.created
  const bc = b.time.created
  if (ac !== bc) return ac < bc ? -1 : 1
  return cmp(a.id, b.id)
}

export function findMsg(messages: readonly Message[], id: string) {
  return messages.findIndex((m) => m.id === id)
}

/** Insert or replace by id, keeping time.created order. */
export function upsertMsg(messages: Message[], message: Message) {
  const at = findMsg(messages, message.id)
  if (at >= 0) {
    messages[at] = message
    // Re-order if created time changed (rare).
    if (
      (at > 0 && msgCmp(messages[at - 1], message) > 0) ||
      (at < messages.length - 1 && msgCmp(message, messages[at + 1]) > 0)
    ) {
      messages.splice(at, 1)
      let i = messages.length
      while (i > 0 && msgCmp(messages[i - 1], message) > 0) i -= 1
      messages.splice(i, 0, message)
      return i
    }
    return at
  }
  let i = messages.length
  while (i > 0 && msgCmp(messages[i - 1], message) > 0) i -= 1
  messages.splice(i, 0, message)
  return i
}

export function sortMsgs(messages: readonly Message[]) {
  return messages.slice().sort(msgCmp)
}
