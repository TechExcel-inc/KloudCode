import { describe, expect, test } from "bun:test"
import type { ContextSize } from "@opencode-ai/sdk/v2/client"
import { contextView, formatTokens } from "./agent-context"

const size: ContextSize = {
  providerID: "p",
  modelID: "m",
  limit: 1_000_000,
  systemPrompt: 9_600,
  systemTools: 16_300,
  mcpTools: 15_900,
  skills: 7_600,
  memoryFiles: 7_400,
  customAgents: 88,
  autocompactBuffer: 33_000,
  mcpToolList: [],
  memoryFileList: [],
  customAgentList: [],
}

describe("contextView", () => {
  test("parts are scaled to the last reply's real token count", () => {
    const view = contextView(size, 118_388, 61_500)
    const rows = Object.fromEntries(view.rows.map((row) => [row.key, row.tokens]))
    expect(view.used).toBe(118_388)
    expect(rows.messages).toBe(61_500)
    expect(rows.systemTools).toBe(16_300)
    expect(rows.freeSpace).toBe(1_000_000 - 118_388 - 33_000)
    expect(view.rows.map((row) => row.key)).toEqual([
      "messages",
      "systemTools",
      "mcpTools",
      "systemPrompt",
      "skills",
      "memoryFiles",
      "customAgents",
      "autocompactBuffer",
      "freeSpace",
    ])
    expect(Math.round(view.percent * 10) / 10).toBe(11.8)
  })

  test("estimates that overshoot the real count shrink to fit it", () => {
    const view = contextView(size, 56_888, 56_888)
    const rows = Object.fromEntries(view.rows.map((row) => [row.key, row.tokens]))
    expect(rows.messages).toBe(28_444)
    expect(rows.systemTools).toBe(8_150)
    expect(view.used).toBe(56_888)
  })

  test("before the first reply the estimates are shown as they are", () => {
    const view = contextView(size, undefined, 500)
    expect(view.rows[0]!.tokens).toBe(500)
    expect(view.used).toBe(57_388)
  })

  test("a model without a known window shows no percentages", () => {
    const view = contextView({ ...size, limit: 0 }, 100_000)
    expect(view.percent).toBe(0)
    expect(view.rows.find((row) => row.key === "freeSpace")!.tokens).toBe(0)
  })
})

test("formatTokens", () => {
  expect([88, 9_600, 118_400, 1_000_000, 1_050_000, 847_600].map(formatTokens)).toEqual([
    "88",
    "9.6k",
    "118.4k",
    "1M",
    "1.05M",
    "847.6k",
  ])
})
