import type { Message, Part } from "@opencode-ai/sdk/v2/client"

export type SessionSummary = {
  /** When the first message was sent; undefined for an empty session. */
  started?: number
  /** From the first message to the latest activity. */
  sessionMs: number
  /**
   * The person's time and effort: the AI's working time, plus the time they spent reading, thinking
   * and typing before each message or answer, up to `effortMs` per pause (longer means they were away).
   * Never less than the AI working time, never more than the session time.
   */
  activeMs: number
  /** Time the AI was answering: replies' start to finish, overlaps counted once, without its waits for answers. */
  workingMs: number
  cost: number
  /** False when the AI used tokens but no reply had a price, so the cost is unknown rather than zero. */
  priced: boolean
}

/**
 * When the AI was waiting on the person: from each question it asked until it was answered (now, while
 * still open). The answer is a moment of activity.
 */
export function waitsFor(parts: Part[], now = Date.now()) {
  return parts.flatMap((part): [number, number][] => {
    if (part.type !== "tool" || part.tool !== "question") return []
    const state = part.state
    if (state.status === "pending") return []
    const end = state.status === "running" ? now : state.time.end
    return [[state.time.start, Math.max(state.time.start, end)]]
  })
}

/** How much of a pause before a message counts as the person's effort; a setting later. */
export const EFFORT_MS = 10 * 60_000

/**
 * AI work recorded by EAD Pilot's gateway: for replies from `provider`, Pilot's request start and end
 * times replace the app's own message times, which miss work and keep abandoned replies open.
 */
export type RecordedWork = { provider: string; spans: [number, number][] }

export function sessionSummary(
  messages: Message[],
  now = Date.now(),
  waits: [number, number][] = [],
  effortMs = EFFORT_MS,
  recorded?: RecordedWork,
): SessionSummary {
  if (messages.length === 0) return { sessionMs: 0, activeMs: 0, workingMs: 0, cost: 0, priced: true }
  const started = Math.min(...messages.map((msg) => msg.time.created))
  const starts = messages.map((msg) => msg.time.created).sort((a, b) => a - b)
  let last = started
  let cost = 0
  let tokens = 0
  const spans: [number, number][] = []
  for (const msg of messages) {
    last = Math.max(last, msg.time.created)
    if (msg.role !== "assistant") continue
    // A reply that never finished ends when the conversation moved on; only the latest one is still running.
    const end = msg.time.completed ?? starts.find((time) => time > msg.time.created) ?? now
    last = Math.max(last, end)
    if (!recorded || msg.providerID !== recorded.provider) spans.push([msg.time.created, end])
    cost += msg.cost
    tokens += msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write
  }
  for (const span of recorded?.spans ?? []) last = Math.max(last, span[1])
  const sessionMs = last - started
  // A wait ends when it was answered, or at the latest when the conversation moved on (the person
  // wrote again or the AI started a new reply): a question left open must not swallow later work.
  const closed = waits.map(([from, to]): [number, number] => {
    const next = starts.find((time) => time > from)
    return [from, next === undefined ? to : Math.min(to, next)]
  })
  waits = closed
  // While the AI waits for an answer it is not working; the wait counts as a gap like any other.
  // Pilot's requests never include waiting: each one is the model answering.
  const working = [...without(spans, waits), ...(recorded?.spans ?? [])]
  const workingMs = joined(working, 0)
  // Each message or answer took the person effort since the last activity: reading, thinking, typing.
  const moments = [
    ...messages.flatMap((msg) => (msg.role === "user" ? [msg.time.created] : [])),
    ...waits.filter((wait) => wait[1] < now).map((wait) => wait[1]),
  ].sort((a, b) => a - b)
  const effort = moments.map((moment): [number, number] => {
    const before = Math.max(started, ...working.filter((span) => span[0] < moment).map((span) => Math.min(span[1], moment)))
    const previous = Math.max(before, ...moments.filter((other) => other < moment))
    return [Math.max(previous, moment - effortMs), moment]
  })
  const activeMs = Math.min(sessionMs, Math.max(workingMs, joined([...working, ...effort], 0)))
  return { started, sessionMs, activeMs, workingMs, cost, priced: cost > 0 || tokens === 0 }
}

/** The spans with the given periods cut out of them. */
function without(spans: [number, number][], cuts: [number, number][]) {
  let out = spans
  for (const [from, to] of cuts) {
    out = out.flatMap(([start, end]): [number, number][] => {
      if (to <= start || from >= end) return [[start, end]]
      return [
        ...(from > start ? [[start, from] as [number, number]] : []),
        ...(to < end ? [[to, end] as [number, number]] : []),
      ]
    })
  }
  return out
}

/** Total length of the spans once joined: spans that overlap or are at most `gap` apart become one. */
function joined(spans: [number, number][], gap: number) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  let total = 0
  let open: [number, number] | undefined
  for (const span of sorted) {
    if (open && span[0] - open[1] <= gap) {
      open[1] = Math.max(open[1], span[1])
      continue
    }
    if (open) total += open[1] - open[0]
    open = [span[0], span[1]]
  }
  if (open) total += open[1] - open[0]
  return total
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

export type ModelCost = { providerID: string; modelID: string; replies: number; input: number; output: number; cost: number }

/**
 * The app's own estimate per model, for every model except `skip` (EAD plans, which EAD Pilot prices),
 * most expensive first.
 */
export function modelCosts(messages: Message[], skip: string): ModelCost[] {
  const out = new Map<string, ModelCost>()
  for (const msg of messages) {
    if (msg.role !== "assistant" || msg.providerID === skip) continue
    const key = `${msg.providerID}/${msg.modelID}`
    const row = out.get(key) ?? { providerID: msg.providerID, modelID: msg.modelID, replies: 0, input: 0, output: 0, cost: 0 }
    row.replies += 1
    row.input += msg.tokens.input + msg.tokens.cache.read + msg.tokens.cache.write
    row.output += msg.tokens.output + msg.tokens.reasoning
    row.cost += msg.cost
    out.set(key, row)
  }
  return [...out.values()].sort((a, b) => b.cost - a.cost || b.replies - a.replies)
}
