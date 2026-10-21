import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { formatDuration, modelCosts, sessionSummary, waitsFor } from "./agent-summary"

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
  test("adds the person's time before each message, up to ten minutes a pause", () => {
    const summary = sessionSummary([
      user(0),
      reply(1 * MIN, 5 * MIN, 0.1), // AI works 4 minutes
      user(8 * MIN), // 3 minutes reading and typing
      reply(8 * MIN, 12 * MIN, 0.1), // AI works 4 minutes
      user(60 * MIN), // 48 minutes later: at most 10 count
      reply(60 * MIN, 65 * MIN, 0.1), // AI works 5 minutes
    ])
    expect(summary.workingMs).toBe(13 * MIN)
    expect(summary.activeMs).toBe(13 * MIN + 3 * MIN + 10 * MIN)
    expect(summary.sessionMs).toBe(65 * MIN)
  })

  test("is never less than AI working time and never more than the session time", () => {
    const rows = [
      [user(0), reply(0, 30 * MIN, 0.1)],
      [user(0), reply(0, 2 * MIN, 0.1), user(3 * MIN), reply(3 * MIN, 4 * MIN, 0.1)],
      [user(0), user(20 * MIN)],
    ]
    for (const messages of rows) {
      const summary = sessionSummary(messages, 40 * MIN)
      expect(summary.activeMs).toBeGreaterThanOrEqual(summary.workingMs)
      expect(summary.activeMs).toBeLessThanOrEqual(summary.sessionMs)
    }
    expect(sessionSummary([user(0), reply(0, 2 * MIN, 0.1), user(3 * MIN), reply(3 * MIN, 4 * MIN, 0.1)]).activeMs).toBe(4 * MIN)
  })

  test("the effort allowance is a setting", () => {
    const messages = [user(0), reply(0, MIN, 0.1), user(30 * MIN), reply(30 * MIN, 31 * MIN, 0.1)]
    expect(sessionSummary(messages, 40 * MIN).activeMs).toBe(2 * MIN + 10 * MIN)
    expect(sessionSummary(messages, 40 * MIN, [], 20 * MIN).activeMs).toBe(2 * MIN + 20 * MIN)
  })
})

describe("waiting for answers", () => {
  const question = (start: number, end?: number) =>
    ({
      type: "tool",
      tool: "question",
      state: end === undefined ? { status: "running", time: { start } } : { status: "completed", time: { start, end } },
    }) as unknown as Part

  test("time the AI waits on a question is not AI working time, but answering is the person's effort", () => {
    // One reply from 1 to 31 minutes, of which 29 minutes (2 to 31) waited on a question.
    const summary = sessionSummary([user(0), reply(1 * MIN, 31 * MIN, 0.1)], 40 * MIN, waitsFor([question(2 * MIN, 31 * MIN)]))
    expect(summary.workingMs).toBe(1 * MIN)
    // AI work (1 minute) plus at most 10 minutes of the person's time before answering.
    expect(summary.activeMs).toBe(11 * MIN)
  })

  test("a reply that never finished ends when the conversation moved on", () => {
    // The reply at 1 minute was abandoned; the person wrote again at 10 and the AI worked 10 to 12.
    const messages = [user(0), reply(1 * MIN, undefined, 0.1), user(10 * MIN), reply(10 * MIN, 12 * MIN, 0.1)]
    const summary = sessionSummary(messages, 60 * MIN)
    expect(summary.workingMs).toBe(9 * MIN + 2 * MIN)
    expect(summary.sessionMs).toBe(12 * MIN)
  })

  test("a question left open does not swallow the work that came after it", () => {
    // The question at 2 minutes was never closed, but the person wrote again at 10 and the AI worked 10 to 30.
    const messages = [user(0), reply(1 * MIN, 3 * MIN, 0.1), user(10 * MIN), reply(10 * MIN, 30 * MIN, 0.1)]
    const summary = sessionSummary(messages, 60 * MIN, waitsFor([question(2 * MIN)], 60 * MIN))
    expect(summary.workingMs).toBe(1 * MIN + 20 * MIN)
  })

  test("a quick answer counts fully, and an open question is not yet anyone's effort", () => {
    const quick = sessionSummary([user(0), reply(0, 10 * MIN, 0.1)], 20 * MIN, waitsFor([question(2 * MIN, 4 * MIN)]))
    expect([quick.workingMs, quick.activeMs]).toEqual([8 * MIN, 10 * MIN])
    const open = sessionSummary([user(0), reply(0, undefined, 0.1)], 30 * MIN, waitsFor([question(5 * MIN)], 30 * MIN))
    expect([open.workingMs, open.activeMs]).toEqual([5 * MIN, 5 * MIN])
  })
})

describe("work recorded by EAD Pilot", () => {
  const plan = (created: number, completed: number | undefined) =>
    ({ ...reply(created, completed, 0), providerID: "ead" }) as unknown as Message

  test("Pilot's request times replace the app's times for EAD plan replies", () => {
    // The app thinks one EAD reply ran 1 to 40 minutes (it was abandoned); Pilot recorded three short requests.
    const messages = [user(0), plan(1 * MIN, undefined), user(40 * MIN), plan(40 * MIN, 41 * MIN)]
    const recorded = { provider: "ead", spans: [[1 * MIN, 2 * MIN], [2 * MIN, 3 * MIN], [40 * MIN, 41 * MIN]] as [number, number][] }
    const summary = sessionSummary(messages, 60 * MIN, [], undefined, recorded)
    expect(summary.workingMs).toBe(3 * MIN)
    // Plus the person's effort before the message at 40 (at most 10 minutes).
    expect(summary.activeMs).toBe(3 * MIN + 10 * MIN)
  })

  test("other models' replies still use the app's times", () => {
    const messages = [user(0), reply(0, 5 * MIN, 0.1)]
    const summary = sessionSummary(messages, 10 * MIN, [], undefined, { provider: "ead", spans: [] })
    expect(summary.workingMs).toBe(5 * MIN)
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
