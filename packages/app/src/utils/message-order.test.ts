import { describe, expect, test } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { findMsg, msgCmp, sortMsgs, upsertMsg } from "./message-order"

const msg = (id: string, created: number): Message =>
  ({
    id,
    sessionID: "ses_1",
    role: "user",
    time: { created },
    agent: "build",
    model: { providerID: "opencode", modelID: "big-pickle" },
  }) as Message

describe("message-order", () => {
  test("sorts by created time across id wrap", () => {
    const older = msg("msg_ff43a3445001old", 1786508883013)
    const newer = msg("msg_02290c847001new", 1787286308948)
    expect(msgCmp(older, newer)).toBeLessThan(0)
    expect(sortMsgs([newer, older]).map((m) => m.id)).toEqual([older.id, newer.id])
  })

  test("upsertMsg inserts wrap-era ids by time not lexicographic id", () => {
    const list = [msg("msg_ff43a3445001old", 1786508883013)]
    upsertMsg(list, msg("msg_02290c847001new", 1787286308948))
    expect(list.map((m) => m.id)).toEqual(["msg_ff43a3445001old", "msg_02290c847001new"])
    expect(findMsg(list, "msg_02290c847001new")).toBe(1)
  })
})
