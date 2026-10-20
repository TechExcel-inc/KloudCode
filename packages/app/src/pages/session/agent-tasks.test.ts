import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { sameChecklist, sessionBackground, sessionTasks } from "./agent-tasks"

const user = (id: string, title?: string, diffs: { file: string; additions: number; deletions: number }[] = []) =>
  ({ id, sessionID: "s", role: "user", time: { created: 1 }, summary: { title, diffs }, agent: "build", model: {} }) as unknown as Message

const reply = (id: string, parentID: string, cost = 0) =>
  ({ id, sessionID: "s", role: "assistant", parentID, cost, time: { created: 2 } }) as unknown as Message

const text = (messageID: string, value: string, synthetic = false) =>
  ({ id: `t-${messageID}`, sessionID: "s", messageID, type: "text", text: value, synthetic }) as unknown as Part

const tool = (messageID: string, name: string, input: Record<string, unknown>, status = "completed", extra: Record<string, unknown> = {}) =>
  ({
    id: `p-${messageID}-${name}-${Math.random()}`,
    sessionID: "s",
    messageID,
    type: "tool",
    tool: name,
    callID: "c",
    state: { status, input, output: "", title: "", metadata: {}, time: { start: 100, end: 200 }, ...extra },
  }) as unknown as Part

const todos = (...items: [string, string][]) => ({ todos: items.map(([content, status]) => ({ content, status, priority: "medium" })) })

describe("sessionTasks", () => {
  test("one task per checklist, newest first, with the request as its title", () => {
    const messages = [
      user("u1", undefined),
      reply("a1", "u1", 0.5),
      user("u2"),
      reply("a2", "u2"),
      user("u3"),
      reply("a3", "u3", 0.25),
    ]
    const parts: Record<string, Part[]> = {
      u1: [text("u1", "\n  Build the usage report\nwith details")],
      a1: [
        tool("a1", "todowrite", todos(["Add table", "in_progress"], ["Add page", "pending"])),
        tool("a1", "todowrite", todos(["Add table", "completed"], ["Add page", "completed"])),
        tool("a1", "write", { filePath: "/repo/docs/usage.md" }),
        tool("a1", "edit", { filePath: "/pilot/Usage.java" }),
      ],
      u2: [text("u2", "what is 2+2?")],
      a2: [text("a2", "4")],
      u3: [text("u3", "Deploy it")],
      a3: [tool("a3", "todowrite", todos(["Back up", "completed"], ["Restart", "in_progress"]))],
    }
    const tasks = sessionTasks(messages, parts)
    expect(tasks.map((task) => task.title)).toEqual(["Deploy it", "Build the usage report"])
    const [deploy, build] = tasks
    expect([deploy!.done, deploy!.steps.length, deploy!.finished]).toEqual([1, 2, false])
    expect([build!.done, build!.finished, build!.cost]).toEqual([2, true, 0.5])
    expect(build!.documents.map((item) => item.path)).toEqual(["/repo/docs/usage.md"])
    expect(build!.elsewhere.map((item) => item.path)).toEqual(["/pilot/Usage.java"])
  })

  test("a request that updates the same checklist joins its task, and its code changes add up", () => {
    const messages = [user("u1", "Build panel", [{ file: "a.ts", additions: 10, deletions: 2 }, { file: "docs/plan.md", additions: 40, deletions: 0 }]), reply("a1", "u1", 1), user("u2", "continue", [{ file: "a.ts", additions: 3, deletions: 1 }, { file: "b.ts", additions: 5, deletions: 0 }]), reply("a2", "u2", 2)]
    const parts: Record<string, Part[]> = {
      a1: [tool("a1", "todowrite", todos(["Map code", "completed"], ["Build UI", "in_progress"], ["Test", "pending"])), tool("a1", "edit", { filePath: "/repo/a.ts" })],
      a2: [tool("a2", "todowrite", todos(["Map code", "completed"], ["Build UI", "completed"], ["Test", "completed"]))],
    }
    const tasks = sessionTasks(messages, parts)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.title).toBe("Build panel")
    expect([tasks[0]!.finished, tasks[0]!.cost]).toEqual([true, 3])
    expect(tasks[0]!.code).toEqual([
      { file: "a.ts", additions: 13, deletions: 3 },
      { file: "b.ts", additions: 5, deletions: 0 },
    ])
    expect([tasks[0]!.added, tasks[0]!.removed]).toEqual([18, 3])
    expect(tasks[0]!.elsewhere).toEqual([])
  })

  test("checklists match when half the shorter one's steps are shared", () => {
    const steps = (...names: string[]) => names.map((content) => ({ content, status: "pending" }))
    expect(sameChecklist(steps("A", "B", "C", "D"), steps("a", "b", "X"))).toBe(true)
    expect(sameChecklist(steps("A", "B", "C", "D"), steps("A", "X", "Y"))).toBe(false)
    expect(sameChecklist([], steps("A"))).toBe(false)
  })
})

describe("sessionBackground", () => {
  test("lists running helper agents and counts finished ones", () => {
    const parts = [
      tool("a1", "task", { description: "Map the engine" }, "running", { title: undefined, metadata: { sessionId: "ses_child" }, time: { start: 50 } }),
      tool("a1", "task", { description: "Search tests" }, "completed"),
      tool("a1", "task", { description: "Broken" }, "error", { error: "x" }),
      tool("a1", "bash", { command: "ls" }, "running"),
    ]
    const result = sessionBackground(parts)
    expect(result.finished).toBe(2)
    expect(result.running).toEqual([{ id: result.running[0]!.id, title: "Map the engine", started: 50, sessionID: "ses_child" }])
  })
})
