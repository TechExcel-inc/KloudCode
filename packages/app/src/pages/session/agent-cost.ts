import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import type { CoworkGatewayCost } from "@/ead/cowork"
import type { Task } from "./agent-tasks"

export type CostEntry = NonNullable<CoworkGatewayCost["entries"]>[number]

/** A checklist step and its requests; requests without a step (sent outside a step, or recorded before steps were) have no title. */
export type CostStep = { title: string | undefined; cost: number; entries: CostEntry[] }

/** One numbered piece of work and what its AI requests cost, in dollars. */
export type CostItem = {
  number: number
  kind: "task" | "other" | "helper"
  /** The task or helper's title; empty for Other work. */
  title: string
  cost: number
  /** Requests without a price. */
  unpriced: number
  steps: CostStep[]
  entries: CostEntry[]
}

const dollars = (entry: CostEntry) => (entry.costMicroUsd ?? 0) / 1_000_000
const at = (entry: CostEntry) => Date.parse(entry.startedAt ?? entry.endedAt ?? "") || 0

function item(kind: CostItem["kind"], title: string, entries: CostEntry[]): Omit<CostItem, "number"> {
  const steps: CostStep[] = []
  for (const entry of entries) {
    const title = entry.stepText?.trim() || undefined
    let step = steps.find((row) => row.title === title)
    if (!step) steps.push((step = { title, cost: 0, entries: [] }))
    step.entries.push(entry)
    step.cost += dollars(entry)
  }
  return {
    kind,
    title,
    cost: entries.reduce((sum, entry) => sum + dollars(entry), 0),
    unpriced: entries.filter((entry) => entry.costMicroUsd == null).length,
    steps,
    entries,
  }
}

/** Helper agents' titles by their session, from the task tool calls that started them. */
function helperTitles(parts: Part[]) {
  const titles = new Map<string, string>()
  for (const part of parts) {
    if (part.type !== "tool" || part.tool !== "task") continue
    const state = part.state
    const metadata = ("metadata" in state ? (state.metadata ?? {}) : {}) as { sessionId?: unknown }
    if (typeof metadata.sessionId !== "string") continue
    const input = state.input as { description?: unknown }
    const title = ("title" in state && state.title) || (typeof input.description === "string" ? input.description : "")
    titles.set(metadata.sessionId, title)
  }
  return titles
}

/**
 * Every AI request recorded by EAD Pilot, grouped into numbered work: the session's tasks (in order),
 * then Other work (requests outside any task), then each helper agent. A request belongs to a task
 * when the user message it served is one of the task's requests. Older requests that do not name
 * their message belong to the latest user message sent before they started.
 */
/** Token and cost totals of a set of requests; costs in millionths of a dollar. */
export function costTotals(entries: CostEntry[]) {
  return entries.reduce(
    (sum, entry) => ({
      input: sum.input + entry.promptTokens - entry.cachedTokens,
      cached: sum.cached + entry.cachedTokens,
      output: sum.output + entry.completionTokens,
      inputCost: sum.inputCost + (entry.inputCostMicroUsd ?? 0),
      cachedCost: sum.cachedCost + (entry.cachedCostMicroUsd ?? 0),
      outputCost: sum.outputCost + (entry.outputCostMicroUsd ?? 0),
      cost: sum.cost + (entry.costMicroUsd ?? 0),
    }),
    { input: 0, cached: 0, output: 0, inputCost: 0, cachedCost: 0, outputCost: 0, cost: 0 },
  )
}

export function costReport(
  sessionID: string,
  messages: Message[],
  parts: Part[],
  tasks: Task[],
  entries: CostEntry[],
): CostItem[] {
  const ordered = [...tasks].reverse()
  const owner = new Map<string, Task>()
  for (const task of ordered) for (const request of task.requests) owner.set(request, task)
  const requests = messages.filter((message) => message.role === "user")
  const messageFor = (entry: CostEntry) => {
    if (entry.messageUid) return entry.messageUid
    const time = at(entry)
    return requests.findLast((message) => message.time.created <= time)?.id
  }

  const byTask = new Map<string, CostEntry[]>()
  const other: CostEntry[] = []
  const helpers = new Map<string, CostEntry[]>()
  for (const entry of [...entries].sort((a, b) => at(a) - at(b))) {
    if (entry.sessionUid && entry.sessionUid !== sessionID) {
      const list = helpers.get(entry.sessionUid) ?? []
      list.push(entry)
      helpers.set(entry.sessionUid, list)
      continue
    }
    const message = messageFor(entry)
    const task = message ? owner.get(message) : undefined
    if (!task) {
      other.push(entry)
      continue
    }
    const list = byTask.get(task.id) ?? []
    list.push(entry)
    byTask.set(task.id, list)
  }

  const titles = helperTitles(parts)
  const items = [
    ...ordered.flatMap((task) => (byTask.has(task.id) ? [item("task", task.title, byTask.get(task.id)!)] : [])),
    ...(other.length > 0 ? [item("other", "", other)] : []),
    ...[...helpers].map(([session, list]) => item("helper", titles.get(session) ?? "", list)),
  ]
  return items.map((row, index) => ({ ...row, number: index + 1 }))
}
