import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session"
import { ContextSize } from "../../src/session/context-size"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID } from "../../src/session/schema"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterEach(async () => {
  await Instance.disposeAll()
})

describe("session context endpoint", () => {
  test("measures each part of the next turn", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "AGENTS.md"), "# Rules\n\n" + "Always write tests first. ".repeat(40))
        await Bun.write(
          path.join(dir, ".kloudcode", "agent", "reviewer.md"),
          "---\ndescription: Reviews a change for bugs before it is committed.\nmode: subagent\n---\n\nReview carefully.\n",
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const id = MessageID.ascending()
        await Session.updateMessage({
          id,
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: "opencode", modelID: "big-pickle" },
          tools: {},
        } as unknown as MessageV2.Info)
        await Session.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: id, type: "text", text: "hi" })

        const res = await Server.Default().app.request(`/session/${session.id}/context`, {
          headers: { "x-opencode-directory": tmp.path },
        })
        expect(res.status).toBe(200)
        const size = (await res.json()) as ContextSize.Info

        expect(size.modelID).toBe("big-pickle")
        expect(size.limit).toBe(200_000)
        expect(size.systemPrompt).toBeGreaterThan(0)
        expect(size.systemTools).toBeGreaterThan(0)
        expect(size.autocompactBuffer).toBe(32_000)
        expect(size.memoryFileList.map((item) => path.basename(item.name))).toContain("AGENTS.md")
        expect(size.memoryFiles).toBe(size.memoryFileList.reduce((sum, item) => sum + item.tokens, 0))
        const reviewer = size.customAgentList.find((item) => item.name === "reviewer")
        expect(reviewer?.tokens).toBeGreaterThan(0)
        expect(size.customAgents).toBe(size.customAgentList.reduce((sum, item) => sum + item.tokens, 0))
      },
    })
  })
})

describe("ContextSize helpers", () => {
  test("memory splits instruction files from other notes", () => {
    const out = ContextSize.memory(["Instructions from: /a/AGENTS.md\nbe brief", "Wiki pages live in wiki/."])
    expect(out.files.map((item) => item.name)).toEqual(["/a/AGENTS.md"])
    expect(out.other).toBeGreaterThan(0)
  })

  test("buffer follows the auto-compact threshold", () => {
    const model = { limit: { context: 200_000, output: 64_000 } } as never
    expect(ContextSize.buffer({} as never, model)).toBe(32_000)
    expect(ContextSize.buffer({ compaction: { auto: false } } as never, model)).toBe(0)
    const input = { limit: { context: 400_000, input: 272_000, output: 128_000 } } as never
    expect(ContextSize.buffer({ compaction: { reserved: 10_000 } } as never, input)).toBe(138_000)
  })
})
