import { describe, expect, test } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { formatDuration, modelCosts, sessionSummary } from "./agent-summary"

const MIN = 60_000

const user = (created: number) => ({ id: `u${created}`, role: "user", time: { created } }) as unknown as Message

const reply = (created: number, completed: number | undefined, cost: number, input = 100) =>
  ({
    id: `a${created}`,
    role: "assistant",
    time: { created, completed },
    cost,
    tokens: { input, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
  }) as unknown as Message

describe("sessionSummary", () => {
  test("session time spans first message to latest activity; working time counts overlaps once", () => {
    const summary = sessionSummary([
      user(0),
      reply(1 * MIN, 5 * MIN, 0.5),
      reply(4 * MIN, 7 * MIN, 0.25),
      user(60 * MIN),
      reply(61 * MIN, 71 * MIN, 1),
    ])
    expect(summary.started).toBe(0)
    expect(summary.sessionMs).toBe(71 * MIN)
    expect(summary.workingMs).toBe(16 * MIN)
    expect(summary.cost).toBe(1.75)
    expect(summary.priced).toBe(true)
  })

  test("a reply still running counts up to now", () => {
    const summary = sessionSummary([user(0), reply(MIN, undefined, 0.1)], 10 * MIN)
    expect([summary.sessionMs, summary.workingMs]).toEqual([10 * MIN, 9 * MIN])
  })

  test("tokens with no price are not priced, rather than free", () => {
    expect(sessionSummary([user(0), reply(MIN, 2 * MIN, 0)]).priced).toBe(false)
    expect(sessionSummary([user(0), reply(MIN, 2 * MIN, 0, 0)]).priced).toBe(false)
    expect(sessionSummary([user(0)]).priced).toBe(true)
    expect(sessionSummary([])).toEqual({ sessionMs: 0, activeMs: 0, workingMs: 0, cost: 0, priced: true })
  })
})

describe("active time", () => {
  test("gaps of up to five minutes count, longer gaps are idle", () => {
    const summary = sessionSummary([
      user(0),
      reply(1 * MIN, 5 * MIN, 0.1),
      user(8 * MIN),
      reply(9 * MIN, 12 * MIN, 0.1),
      user(60 * MIN),
      reply(61 * MIN, 65 * MIN, 0.1),
    ])
    // 0 to 12 minutes is one period (gaps of 1, 3 and 1 minutes), then 48 idle minutes, then 60 to 65.
    expect(summary.activeMs).toBe(12 * MIN + 5 * MIN)
    expect(summary.sessionMs).toBe(65 * MIN)
    expect(summary.workingMs).toBe(11 * MIN)
  })

  test("a message bridges a gap but adds no time of its own", () => {
    const summary = sessionSummary([reply(0, 2 * MIN, 0.1), user(6 * MIN), reply(10 * MIN, 11 * MIN, 0.1)])
    expect(summary.activeMs).toBe(11 * MIN)
    const alone = sessionSummary([user(0), user(20 * MIN)])
    expect(alone.activeMs).toBe(0)
  })

  test("a gap of exactly five minutes still counts, and a long reply counts in full", () => {
    expect(sessionSummary([user(0), reply(5 * MIN, 25 * MIN, 0.1)]).activeMs).toBe(25 * MIN)
    expect(sessionSummary([user(0), reply(5 * MIN + 1, 25 * MIN, 0.1)]).activeMs).toBe(20 * MIN - 1)
  })

  test("active time never exceeds the session time", () => {
    const summary = sessionSummary([user(0), reply(MIN, undefined, 0.1)], 10 * MIN)
    expect(summary.activeMs).toBeLessThanOrEqual(summary.sessionMs)
    expect(summary.activeMs).toBe(10 * MIN)
  })
})

test("formatDuration", () => {
  expect([30_000, 42 * MIN, 200 * MIN, 52 * 60 * MIN].map(formatDuration)).toEqual(["<1m", "42m", "3h 20m", "2d 4h"])
})

test("modelCosts groups the app's estimates by model and leaves EAD plans to Pilot", () => {
  const msg = (providerID: string, modelID: string, cost: number) =>
    ({
      role: "assistant",
      providerID,
      modelID,
      cost,
      time: { created: 1 },
      tokens: { input: 100, output: 10, reasoning: 5, cache: { read: 50, write: 0 } },
    }) as unknown as Message
  const rows = modelCosts(
    [msg("deepseek", "v4-pro", 0.01), msg("ead", "EAD 3.2", 0), msg("anthropic", "opus", 0.2), msg("deepseek", "v4-pro", 0.02)],
    "ead",
  )
  expect(rows.map((row) => [row.modelID, row.replies, row.input, row.output, Math.round(row.cost * 100) / 100])).toEqual([
    ["opus", 1, 150, 15, 0.2],
    ["v4-pro", 2, 300, 30, 0.03],
  ])
})
