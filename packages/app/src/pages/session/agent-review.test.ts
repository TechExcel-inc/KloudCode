import { describe, expect, test } from "bun:test"
import {
  canCommit,
  checkedByDefault,
  fileWarnings,
  filesToCommit,
  folderGroups,
  parseReview,
  type ChangeFile,
} from "./agent-review"

const file = (name: string, more: Partial<ChangeFile> = {}): ChangeFile => ({
  file: name,
  additions: 1,
  deletions: 0,
  status: "added",
  ...more,
})
const kinds = (item: ChangeFile, session: string[] = [item.file]) => fileWarnings(item, session).map((w) => w.kind)

describe("fileWarnings", () => {
  test("flags secrets and local tool settings by name and folder", () => {
    for (const name of [
      ".env",
      ".env.local",
      "certs/server.pem",
      "a.key",
      "aws_credentials.json",
      "my-secret.txt",
      "id_rsa.pub",
      ".cursor/mcp.json",
      ".claude/settings.json",
    ])
      expect([name, kinds(file(name))]).toEqual([name, ["secret"]])
    expect(kinds(file("src/env.ts"))).toEqual([])
  })

  test("flags secrets by added text", () => {
    for (const line of [
      "-----BEGIN RSA PRIVATE KEY-----",
      `token = "ghp_${"a".repeat(30)}"`,
      `key: sk-${"b".repeat(20)}`,
      "AKIAABCDEFGHIJKLMNOP",
      "password=hunter2",
    ])
      expect(kinds(file("src/config.ts", { patch: `@@ -0,0 +1 @@\n+${line}\n` }))).toEqual(["secret"])
    expect(kinds(file("src/config.ts", { patch: `@@ -1 +0,0 @@\n-password=old\n` }))).toEqual([])
  })

  test("flags build output, archives and logs, large files, and files this session did not change", () => {
    expect(kinds(file("packages/app/dist/index.js"))).toEqual(["artifact"])
    expect(kinds(file("node_modules/x/index.js"))).toEqual(["artifact"])
    expect(kinds(file("release/App.dmg"))).toEqual(["artifact"])
    expect(kinds(file("debug.log"))).toEqual(["artifact"])
    expect(kinds(file("src/build.ts"))).toEqual([])
    expect(kinds(file("assets/video.mp4", { size: 2 * 1024 * 1024, binary: true }))).toEqual(["large"])
    expect(kinds(file("src/a.ts"), ["src/b.ts"])).toEqual(["outside"])
    expect(kinds(file("packages/app/src/a.ts"), ["src/a.ts"])).toEqual([])
  })

  test("a deleted file is only checked against the session", () => {
    expect(kinds(file(".env", { status: "deleted" }))).toEqual([])
  })

  test("secrets and build output start unchecked; large and outside files start checked", () => {
    expect(checkedByDefault(fileWarnings(file(".env"), [".env"]))).toBe(false)
    expect(checkedByDefault(fileWarnings(file("dist/a.js"), ["dist/a.js"]))).toBe(false)
    expect(checkedByDefault(fileWarnings(file("big.bin", { size: 5e6 }), []))).toBe(true)
  })
})

describe("grouping", () => {
  test("falls back to top folders, top-level files last", () => {
    expect(folderGroups(["src/a.ts", "README.md", ".cursor/mcp.json", "src/b/c.ts"])).toEqual([
      { title: ".cursor", files: [".cursor/mcp.json"] },
      { title: "src", files: ["src/a.ts", "src/b/c.ts"] },
      { title: undefined, files: ["README.md"] },
    ])
  })

  test("reads the AI's JSON, drops unknown or repeated files and puts unmentioned ones last", () => {
    const reply =
      'Sure:\n```json\n{"message":"Add login","summary":"Adds a login page.","groups":[{"title":"Login","files":["src/login.ts","nope.ts","src/login.ts"]},{"title":"","files":[]}],"warnings":[{"file":".env","reason":"Has a token"},{"file":"x","reason":"?"}]}\n```'
    expect(parseReview(reply, ["src/login.ts", ".env", "README.md"])).toEqual({
      message: "Add login",
      summary: "Adds a login page.",
      groups: [{ title: "Login", files: ["src/login.ts"] }, { files: [".env", "README.md"] }],
      warnings: { ".env": ["Has a token"] },
    })
    expect(parseReview("no json here", ["a"])).toBeUndefined()
    expect(parseReview("{not json}", ["a"])).toBeUndefined()
  })
})

describe("filesToCommit", () => {
  test("stages only the checked files and needs a message", () => {
    const files = ["a.ts", ".env", "b.ts"]
    const picked = filesToCommit(files, { "a.ts": true, ".env": false, "b.ts": true })
    expect(picked).toEqual(["a.ts", "b.ts"])
    expect(canCommit(picked, "  ")).toBe(false)
    expect(canCommit([], "Message")).toBe(false)
    expect(canCommit(picked, "Message")).toBe(true)
  })
})
