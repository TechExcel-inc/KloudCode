import type { Message } from "@opencode-ai/sdk/v2/client"

export type SessionSummary = {
  /** When the first message was sent; undefined for an empty session. */
  started?: number
  /** From the first message to the latest activity. */
  sessionMs: number
  /** Time the AI was answering: replies' start to finish, overlaps counted once. */
  workingMs: number
  cost: number
  /** False when the AI used tokens but no reply had a price, so the cost is unknown rather than zero. */
  priced: boolean
}

export function sessionSummary(messages: Message[], now = Date.now()): SessionSummary {
  if (messages.length === 0) return { sessionMs: 0, workingMs: 0, cost: 0, priced: true }
  const started = Math.min(...messages.map((msg) => msg.time.created))
  let last = started
  let cost = 0
  let tokens = 0
  const spans: [number, number][] = []
  for (const msg of messages) {
    last = Math.max(last, msg.time.created)
    if (msg.role !== "assistant") continue
    const end = msg.time.completed ?? now
    last = Math.max(last, end)
    spans.push([msg.time.created, end])
    cost += msg.cost
    tokens += msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write
  }
  spans.sort((a, b) => a[0] - b[0])
  let workingMs = 0
  let open: [number, number] | undefined
  for (const span of spans) {
    if (open && span[0] <= open[1]) {
      open[1] = Math.max(open[1], span[1])
      continue
    }
    if (open) workingMs += open[1] - open[0]
    open = [span[0], span[1]]
  }
  if (open) workingMs += open[1] - open[0]
  return { started, sessionMs: last - started, workingMs, cost, priced: cost > 0 || tokens === 0 }
}

/** "<1m", "42m", "3h 20m", "2d 4h" */
export function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "<1m"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
