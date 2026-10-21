import { describe, expect, test } from "bun:test"
import path from "path"
import { Global } from "../../src/global"
import { Installation } from "../../src/installation"
import { Database } from "../../src/storage/db"

describe("Database.Path", () => {
  test("returns database path for the current channel", () => {
    const expected = ["latest", "beta"].includes(Installation.CHANNEL)
      ? path.join(Global.Path.data, "opencode.db")
      : path.join(Global.Path.data, `opencode-${Installation.CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
    expect(Database.getChannelPath()).toBe(expected)
  })
})

describe("Database.closeInterrupted", () => {
  test("ends replies and tool calls left running by a stopped engine, and leaves finished ones alone", () => {
    const { Database: Sqlite } = require("bun:sqlite") as typeof import("bun:sqlite")
    const client = new Sqlite(":memory:")
    client.run("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT)")
    client.run("CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT)")
    const add = (table: string, id: string, updated: number, data: object, message = "") =>
      table === "message"
        ? client.run("INSERT INTO message VALUES (?, 's', 0, ?, ?)", [id, updated, JSON.stringify(data)])
        : client.run("INSERT INTO part VALUES (?, ?, 's', 0, ?, ?)", [id, message, updated, JSON.stringify(data)])
    add("message", "open", 100, { role: "assistant", time: { created: 100 } })
    add("message", "done", 100, { role: "assistant", time: { created: 100, completed: 150 } })
    add("message", "user", 100, { role: "user", time: { created: 90 } })
    add("part", "p1", 400, { type: "tool", state: { status: "running", input: {}, time: { start: 300 } } }, "open")
    add("part", "p2", 500, { type: "text", text: "partial" }, "open")
    add("part", "p3", 120, { type: "tool", state: { status: "completed", input: {}, time: { start: 110, end: 120 } } }, "done")

    Database.closeInterrupted(client, 999)

    const data = (table: string, id: string) =>
      JSON.parse((client.query(`SELECT data FROM ${table} WHERE id = ?`).get(id) as { data: string }).data)
    const open = data("message", "open")
    expect(open.time.completed).toBe(500)
    expect(open.error.name).toBe("MessageAbortedError")
    expect(data("message", "done")).toEqual({ role: "assistant", time: { created: 100, completed: 150 } })
    expect(data("message", "user").time.completed).toBeUndefined()
    const tool = data("part", "p1").state
    expect([tool.status, tool.time.start, tool.time.end]).toEqual(["error", 300, 400])
    expect(data("part", "p3").state.status).toBe("completed")
  })
})
