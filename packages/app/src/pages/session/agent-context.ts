import type { ContextSize } from "@opencode-ai/sdk/v2/client"

export type ContextRowKey =
  | "messages"
  | "systemTools"
  | "mcpTools"
  | "systemPrompt"
  | "skills"
  | "memoryFiles"
  | "customAgents"
  | "autocompactBuffer"
  | "freeSpace"

export type ContextRow = { key: ContextRowKey; tokens: number; percent: number }

export type ContextView = {
  /** Tokens in use: everything except the auto-compact buffer and free space. */
  used: number
  limit: number
  percent: number
  rows: ContextRow[]
}

const FIXED: Exclude<ContextRowKey, "messages" | "freeSpace">[] = [
  "systemTools",
  "mcpTools",
  "systemPrompt",
  "skills",
  "memoryFiles",
  "customAgents",
]

const share = (tokens: number, limit: number) => (limit > 0 ? (tokens / limit) * 100 : 0)

/**
 * The Context box. The engine estimates the fixed parts of the next turn and `messages` is the
 * app's estimate of the conversation; when the last reply reports its real token count (`total`),
 * every part is scaled so they add up to it, as the provider counted.
 */
export function contextView(size: ContextSize, total: number | undefined, messages = 0): ContextView {
  const limit = size.limit
  const parts: [ContextRowKey, number][] = [["messages", messages], ...FIXED.map((key) => [key, size[key]] as [ContextRowKey, number])]
  const estimated = parts.reduce((sum, [, tokens]) => sum + tokens, 0)
  const scale = total && estimated > 0 ? total / estimated : 1
  const scaled = parts.map(([key, tokens]) => [key, Math.round(tokens * scale)] as [ContextRowKey, number])
  const used = total && estimated > 0 ? total : estimated
  const buffer = size.autocompactBuffer
  const free = Math.max(0, limit - used - buffer)
  const row = (key: ContextRowKey, tokens: number) => ({ key, tokens, percent: share(tokens, limit) })
  return {
    used,
    limit,
    percent: share(used, limit),
    rows: [...scaled.map(([key, tokens]) => row(key, tokens)), row("autocompactBuffer", buffer), row("freeSpace", free)],
  }
}

/** 88, 9.6k, 118.4k, 1M, 1.05M */
export function formatTokens(value: number) {
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${trim((value / 1000).toFixed(1))}k`
  return `${trim((value / 1_000_000).toFixed(2))}M`
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

const trim = (text: string) => text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
