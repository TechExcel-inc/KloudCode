import { describe, expect, test } from "bun:test"
import { Identifier } from "../../src/id/id"

describe("Identifier", () => {
  test("ascending ids stay ordered across the 2026-08-14 6-byte wrap window", () => {
    const pre = Identifier.create("message", false, Date.parse("2026-08-12T00:00:00.000Z"))
    const mid = Identifier.create("message", false, Date.parse("2026-08-15T00:00:00.000Z"))
    const post = Identifier.create("message", false, Date.parse("2026-08-21T00:00:00.000Z"))
    expect(pre < mid).toBe(true)
    expect(mid < post).toBe(true)
  })

  test("timestamp round-trips for new 8-byte ascending ids", () => {
    const ts = Date.parse("2026-08-21T04:00:00.000Z")
    const id = Identifier.create("message", false, ts)
    expect(Identifier.timestamp(id)).toBe(ts)
  })
})
