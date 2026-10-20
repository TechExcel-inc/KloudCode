import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2/client"
import { outputGroup, sessionOutputs } from "./agent-outputs"

const tool = (name: string, input: Record<string, unknown>, end: number, metadata: Record<string, unknown> = {}, status = "completed") =>
  ({
    id: `p${end}`,
    sessionID: "s",
    messageID: "m",
    type: "tool",
    tool: name,
    callID: `c${end}`,
    state:
      status === "completed"
        ? { status, input, output: "", title: "", metadata, time: { start: end - 1, end } }
        : { status, input, error: "failed", time: { start: end - 1, end } },
  }) as unknown as Part

describe("sessionOutputs", () => {
  test("lists written and edited files once, newest first, across folders", () => {
    const parts = [
      tool("write", { filePath: "/a/docs/plan.md" }, 10),
      tool("edit", { filePath: "/a/src/app.tsx" }, 20),
      tool("read", { filePath: "/a/src/other.ts" }, 25),
      tool("multiedit", { filePath: "/b/Service.java" }, 30),
      tool("edit", { filePath: "/a/docs/plan.md" }, 40),
    ]
    expect(sessionOutputs(parts).map((item) => [item.path, item.time])).toEqual([
      ["/a/docs/plan.md", 40],
      ["/b/Service.java", 30],
      ["/a/src/app.tsx", 20],
    ])
  })

  test("takes patch files from metadata, following moves and skipping deletes", () => {
    const parts = [
      tool("apply_patch", {}, 5, {
        files: [
          { filePath: "/a/new.png", type: "add" },
          { filePath: "/a/old.html", movePath: "/a/page.html", type: "move" },
          { filePath: "/a/gone.ts", type: "delete" },
        ],
      }),
    ]
    expect(sessionOutputs(parts).map((item) => [item.path, item.group])).toEqual([
      ["/a/new.png", "images"],
      ["/a/page.html", "pages"],
    ])
  })

  test("ignores failed tool calls", () => {
    expect(sessionOutputs([tool("write", { filePath: "/a/x.ts" }, 1, {}, "error")])).toEqual([])
  })
})

describe("outputGroup", () => {
  test("groups by file type", () => {
    expect(outputGroup("/x/README.MD")).toBe("documents")
    expect(outputGroup("C:\\x\\shot.JPG")).toBe("images")
    expect(outputGroup("/x/index.htm")).toBe("pages")
    expect(outputGroup("/x/Makefile")).toBe("code")
    expect(outputGroup("/x/.env")).toBe("code")
  })
})
