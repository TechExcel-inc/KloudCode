import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const flag = "OPENCODE_EXPERIMENTAL_ONE_TIME_SESSIONS"

afterEach(async () => {
  delete process.env[flag]
  await Instance.disposeAll()
})

async function within(fn: (dir: string) => Promise<void>) {
  const model = {
    name: "Expert",
    attachment: false,
    reasoning: false,
    temperature: false,
    tool_call: true,
    release_date: "2025-01-01",
    limit: { context: 100000, output: 10000 },
    cost: { input: 0, output: 0 },
    options: {},
    one_session: { limit: 3 },
  }
  const config = {
    provider: {
      test: {
        name: "Test",
        id: "test",
        env: [],
        npm: "@ai-sdk/openai-compatible",
        models: { expert: { id: "expert", ...model } },
        options: { apiKey: "test-key", baseURL: "http://localhost:1/v1" },
      },
    },
  }
  await using tmp = await tmpdir({
    git: true,
    init: (dir) => Bun.write(path.join(dir, "opencode.json"), JSON.stringify(config)),
  })
  await Instance.provide({ directory: tmp.path, fn: () => fn(tmp.path) })
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

describe("one-time session routes", () => {
  test("are hidden while the flag is off", async () => {
    await within(async () => {
      const res = await Server.Default().app.request(
        "/session/one-time",
        json({ model: { providerID: "test", modelID: "expert" } }),
      )
      expect(res.status).toBe(404)
    })
  })

  test("open, done and reopen work over HTTP", async () => {
    process.env[flag] = "1"
    await within(async (dir) => {
      const app = Server.Default().app
      const q = `?directory=${encodeURIComponent(dir)}`
      const origin = await Session.create({ title: "Origin" })

      const opened = await app.request(
        `/session/one-time${q}`,
        json({ originSessionID: origin.id, model: { providerID: "test", modelID: "expert" } }),
      )
      expect(opened.status).toBe(200)
      const session = (await opened.json()) as Session.Info
      expect(session.oneTime?.limit).toBe(3)
      expect(session.oneTime?.originSessionID).toBe(origin.id)

      const done = await app.request(
        `/session/${session.id}/one-time/done${q}`,
        json({ goTo: "origin", addResult: true }),
      )
      expect(done.status).toBe(200)
      const result = (await done.json()) as { targetSessionID: string; fallback: boolean }
      expect(result).toMatchObject({ targetSessionID: origin.id, fallback: false })

      const reopened = await app.request(`/session/${session.id}/one-time/reopen${q}`, { method: "POST" })
      expect(reopened.status).toBe(200)
      expect(((await reopened.json()) as Session.Info).oneTime?.status).toBe("open")
    })
  })
})
