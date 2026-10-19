import { describe, expect, test } from "bun:test"
import type { Part, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { carried, projectSwitch } from "./session-project"

const request = (callID?: string) =>
  ({
    id: "que_1",
    sessionID: "ses_1",
    questions: [],
    tool: callID ? { messageID: "msg_1", callID } : undefined,
  }) as QuestionRequest

const tool = (name: string, input: Record<string, unknown>) =>
  ({
    id: "prt_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    type: "tool",
    callID: "call_1",
    tool: name,
    state: { status: "running", input, time: { start: 0 } },
  }) as Part

describe("session project switch", () => {
  test("finds the project_switch call behind a question", () => {
    const parts = { msg_1: [tool("project_switch", { project: "/work/cowork", prompt: "Fix login" })] }
    expect(projectSwitch(request("call_1"), parts)).toEqual({ project: "/work/cowork", prompt: "Fix login" })
  })

  test("leaves other questions to the question dock", () => {
    expect(projectSwitch(request(), {})).toBeUndefined()
    expect(projectSwitch(request("call_1"), { msg_1: [tool("question", { questions: [] })] })).toBeUndefined()
    expect(projectSwitch(request("call_1"), { msg_1: [tool("project_switch", {})] })).toBeUndefined()
  })

  test("a new session carries the person's own first message", () => {
    const parts = [
      { type: "text", text: "Fix the login in CoWork" },
      { type: "text", text: "context", synthetic: true },
      { type: "file", mime: "image/png", url: "data:x", filename: "a.png" },
      { type: "step-start" },
    ] as Part[]
    expect(carried({ fresh: true, parts, prompt: "brief", from: "KloudCode" })).toEqual([
      { type: "text", text: "Fix the login in CoWork" },
      { type: "file", mime: "image/png", url: "data:x", filename: "a.png" },
    ])
  })

  test("an existing session carries the agent's brief", () => {
    expect(carried({ fresh: false, parts: [], prompt: "Fix login", from: "KloudCode" })).toEqual([
      { type: "text", text: "Fix login\n\n(Continued from a session in KloudCode.)" },
    ])
  })
})
