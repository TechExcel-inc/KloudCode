import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2/client"

export const DAY = 24 * 60 * 60 * 1000

/** The choices Settings offers for archiving inactive sessions; 0 means never. */
export const DAYS = [0, 1, 2, 7, 14, 30] as const

type Row = {
  id: string
  parentID?: string
  directory: string
  title: string
  time: { updated: number; archived?: number | null }
}

/**
 * Root sessions to archive automatically: no activity for `days` days, counting a "Make active" as
 * activity, and never the session that is open.
 */
export function stale<T extends Row>(
  list: T[],
  input: { days: number; now: number; kept: Record<string, number>; open?: string },
) {
  if (input.days <= 0) return []
  const cutoff = input.now - input.days * DAY
  return list.filter(
    (item) =>
      !item.parentID &&
      !item.time.archived &&
      item.id !== input.open &&
      Math.max(item.time.updated, input.kept[item.id] ?? 0) < cutoff,
  )
}

/** The Show choices in Advanced Search. Archived includes the auto archived sessions. */
export const SHOWS = ["open", "finished", "archived", "auto"] as const
export type Show = (typeof SHOWS)[number]

type Marks = { auto: Record<string, number>; finished: Record<string, number> }

/** Which Show choices a session falls under: open or finished while active, archived (and auto) once archived. */
export function shows(item: Pick<Row, "id" | "time">, marks: Marks): Show[] {
  if (item.time.archived) return marks.auto[item.id] ? ["archived", "auto"] : ["archived"]
  return marks.finished[item.id] ? ["finished"] : ["open"]
}

/**
 * Root sessions Advanced Search shows: any ticked Show choice, inside one of the projects, with the
 * keywords in the title, last active between the dates (inclusive days in local time).
 */
export function filter<T extends Row>(
  list: T[],
  input: Marks & { show: Show[]; search: string; projects?: string[]; from?: string; to?: string },
) {
  const words = input.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const from = input.from ? new Date(`${input.from}T00:00:00`).getTime() : undefined
  const to = input.to ? new Date(`${input.to}T00:00:00`).getTime() + DAY : undefined
  return list.filter((item) => {
    if (item.parentID) return false
    if (!shows(item, input).some((value) => input.show.includes(value))) return false
    if (input.projects && !input.projects.some((dir) => item.directory === dir || item.directory.startsWith(`${dir}/`)))
      return false
    const title = item.title.toLowerCase()
    if (!words.every((word) => title.includes(word))) return false
    if (from !== undefined && item.time.updated < from) return false
    if (to !== undefined && item.time.updated >= to) return false
    return true
  })
}

/** Tokens a session used: every assistant turn's input, output, reasoning and cache tokens. */
export function tokens(messages: Message[]) {
  return messages
    .filter((item): item is AssistantMessage => item.role === "assistant")
    .reduce(
      (sum, item) =>
        sum +
        (item.tokens.total ??
          item.tokens.input +
            item.tokens.output +
            item.tokens.reasoning +
            item.tokens.cache.read +
            item.tokens.cache.write),
      0,
    )
}

export function compact(value: number) {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`
  return `${(value / 1_000_000).toFixed(1)}M`
}
