import { describe, expect, test } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { compact, DAY, filter, SHOWS, shows, stale, tokens } from "./archive"

const now = new Date("2026-10-20T12:00:00").getTime()

const session = (input: {
  id: string
  updated: number
  archived?: number
  parentID?: string
  dir?: string
  title?: string
}) => ({
  id: input.id,
  parentID: input.parentID,
  directory: input.dir ?? "/work/app",
  title: input.title ?? input.id,
  time: { created: input.updated, updated: input.updated, archived: input.archived },
})

describe("archive", () => {
  test("stale picks root sessions idle past the limit", () => {
    const list = [
      session({ id: "old", updated: now - 8 * DAY }),
      session({ id: "fresh", updated: now - 2 * DAY }),
      session({ id: "child", updated: now - 9 * DAY, parentID: "old" }),
      session({ id: "done", updated: now - 9 * DAY, archived: now - DAY }),
      session({ id: "open", updated: now - 9 * DAY }),
      session({ id: "kept", updated: now - 9 * DAY }),
    ]
    const ids = stale(list, { days: 7, now, kept: { kept: now - DAY }, open: "open" }).map((item) => item.id)
    expect(ids).toEqual(["old"])
  })

  test("stale archives nothing when set to never", () => {
    expect(stale([session({ id: "old", updated: now - 90 * DAY })], { days: 0, now, kept: {} })).toEqual([])
  })

  test("filter by ticked choices, projects, keywords and inclusive dates", () => {
    const list = [
      session({ id: "a", title: "Fix login", updated: new Date("2026-10-01T09:00:00").getTime(), archived: now }),
      session({ id: "b", title: "Docs", updated: new Date("2026-10-05T23:00:00").getTime(), archived: now }),
      session({ id: "c", title: "Fix layout", updated: new Date("2026-10-06T10:00:00").getTime() }),
      session({ id: "d", title: "Fix api", updated: new Date("2026-10-03T10:00:00").getTime(), dir: "/work/api" }),
      session({ id: "e", title: "Ship release", updated: new Date("2026-10-04T10:00:00").getTime() }),
    ]
    const marks = { auto: { b: now }, finished: { e: now } }
    const all = [...SHOWS]
    const ids = (input: Partial<Parameters<typeof filter>[1]>) =>
      filter(list, { ...marks, show: all, search: "", ...input }).map((item) => item.id)
    expect(ids({ show: ["open"] })).toEqual(["c", "d"])
    expect(ids({ show: ["finished"] })).toEqual(["e"])
    expect(ids({ show: ["archived"] })).toEqual(["a", "b"])
    expect(ids({ show: ["auto"] })).toEqual(["b"])
    expect(ids({ show: ["archived", "finished"] })).toEqual(["a", "b", "e"])
    expect(ids({ show: [] })).toEqual([])
    expect(ids({ search: "fix" })).toEqual(["a", "c", "d"])
    expect(ids({ search: "fix  LOG" })).toEqual(["a"])
    expect(ids({ projects: ["/work/app"] })).toEqual(["a", "b", "c", "e"])
    expect(ids({ projects: ["/work/app", "/work/api"] })).toEqual(["a", "b", "c", "d", "e"])
    expect(ids({ from: "2026-10-03", to: "2026-10-05" })).toEqual(["b", "d", "e"])
  })

  test("shows tells open, finished, archived and auto archived apart", () => {
    const marks = { auto: { x: now }, finished: { y: now } }
    expect(shows({ id: "x", time: { updated: now, archived: now } }, marks)).toEqual(["archived", "auto"])
    expect(shows({ id: "z", time: { updated: now, archived: now } }, marks)).toEqual(["archived"])
    expect(shows({ id: "y", time: { updated: now } }, marks)).toEqual(["finished"])
    expect(shows({ id: "z", time: { updated: now } }, marks)).toEqual(["open"])
  })

  test("tokens add up every assistant turn", () => {
    const turn = (input: number, output: number, total?: number) =>
      ({
        role: "assistant",
        tokens: { total, input, output, reasoning: 5, cache: { read: 10, write: 1 } },
      }) as Message
    const messages = [{ role: "user" } as Message, turn(100, 50), turn(0, 0, 400)]
    expect(tokens(messages)).toBe(166 + 400)
  })

  test("compact formats large counts", () => {
    expect(compact(950)).toBe("950")
    expect(compact(1234)).toBe("1.2K")
    expect(compact(45_600)).toBe("46K")
    expect(compact(2_500_000)).toBe("2.5M")
  })
})
