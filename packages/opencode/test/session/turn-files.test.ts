import { describe, expect, test } from "bun:test"
import { TurnFiles } from "../../src/session/turn-files"

const where = { worktree: "/repo", directory: "/repo/app" }
const diff = (file: string) => ({ file, patch: "", additions: 1, deletions: 0 })
const tool = (name: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}) => ({
  type: "tool",
  tool: name,
  state: { status: "completed", input, metadata },
})

describe("TurnFiles.collect", () => {
  test("reads file tool paths, apply_patch bodies and metadata, and shell commands", () => {
    const touched = TurnFiles.collect([
      tool("edit", { filePath: "/repo/app/a.ts" }),
      tool("write", { filePath: "b.ts" }),
      tool("apply_patch", { patchText: "*** Begin Patch\n*** Update File: c.ts\n*** Move to: d.ts\n*** End Patch" }),
      tool("apply_patch", {}, { files: [{ filePath: "/repo/app/e.ts" }] }),
      tool("bash", { command: "rm old.txt" }),
      tool("read", { filePath: "/repo/app/r.ts" }),
      { type: "text" },
    ])
    expect(touched.files).toEqual(["/repo/app/a.ts", "b.ts", "c.ts", "d.ts", "/repo/app/e.ts"])
    expect(touched.commands).toEqual(["rm old.txt"])
  })
})

describe("TurnFiles.filter", () => {
  test("keeps files the turn's tools touched, given absolute or folder-relative paths", () => {
    const diffs = [diff("app/a.ts"), diff("app/b.ts"), diff("app/other.ts"), diff("lib/x.ts")]
    const kept = TurnFiles.filter(diffs, { files: ["/repo/app/a.ts", "b.ts"], commands: [] }, where)
    expect(kept.map((d) => d.file)).toEqual(["app/a.ts", "app/b.ts"])
  })

  test("keeps files a shell command names by path or file name, not by a longer name", () => {
    const diffs = [diff("app/gen/out.json"), diff("app/notes.md"), diff("app/readme.md"), diff("app/main.ts")]
    const kept = TurnFiles.filter(
      diffs,
      { files: [], commands: ["node build.js > gen/out.json && sed -i '' s/a/b/ notes.md && cat my-readme.md"] },
      where,
    )
    expect(kept.map((d) => d.file)).toEqual(["app/gen/out.json", "app/notes.md"])
  })

  test("drops everything when the turn changed no files itself", () => {
    expect(TurnFiles.filter([diff("app/a.ts")], { files: [], commands: [] }, where)).toEqual([])
  })
})

describe("TurnFiles.discardPlan", () => {
  test("allows only listed files inside the session folder", () => {
    const plan = TurnFiles.discardPlan(
      ["app/a.ts", "/repo/app/b.ts", "app/not-listed.ts", "lib/x.ts", "../etc/passwd", "app/a.ts"],
      [diff("app/a.ts"), diff("app/b.ts"), diff("lib/x.ts")],
      where,
    )
    expect(plan.allowed).toEqual(["app/a.ts", "app/b.ts"])
    expect(plan.refused).toEqual(["app/not-listed.ts", "lib/x.ts", "../etc/passwd"])
  })
})
