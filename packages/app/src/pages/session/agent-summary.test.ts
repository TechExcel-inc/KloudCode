import { describe, expect, test } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { formatDuration, sessionSummary } from "./agent-summary"

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
    expect(sessionSummary([])).toEqual({ sessionMs: 0, workingMs: 0, cost: 0, priced: true })
  })
})

test("formatDuration", () => {
  expect([30_000, 42 * MIN, 200 * MIN, 52 * 60 * MIN].map(formatDuration)).toEqual(["<1m", "42m", "3h 20m", "2d 4h"])
})
