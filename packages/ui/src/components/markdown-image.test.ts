import { describe, expect, test } from "bun:test"
import {
  classifyImageSource,
  isImagePath,
  loadImageSource,
  optionImageSource,
  projectFileToDataUrl,
  svgCodeToDataUrl,
  writtenImageUrl,
} from "./markdown-image"

const dir = "/Users/me/proj"

describe("markdown-image", () => {
  test("loads http(s) and inline image data directly", () => {
    expect(classifyImageSource("https://example.com/a.png", dir)).toEqual({
      kind: "url",
      url: "https://example.com/a.png",
    })
    expect(classifyImageSource("data:image/png;base64,AAAA", dir).kind).toBe("url")
    expect(classifyImageSource("data:text/html,<script>", dir)).toEqual({ kind: "blocked", reason: "not-image" })
  })

  test("reads project images through the project file reader, by relative path", () => {
    expect(classifyImageSource("designs/a.svg", dir)).toEqual({ kind: "project", path: "designs/a.svg" })
    expect(classifyImageSource("./designs/a.png", dir)).toEqual({ kind: "project", path: "designs/a.png" })
    expect(classifyImageSource("/Users/me/proj/designs/a.png", dir)).toEqual({ kind: "project", path: "designs/a.png" })
    expect(classifyImageSource("file:///Users/me/proj/my%20icon.svg", dir)).toEqual({
      kind: "project",
      path: "my icon.svg",
    })
  })

  test("never reads images outside the project", () => {
    expect(classifyImageSource("/tmp/icons/a.svg", dir)).toEqual({ kind: "blocked", reason: "outside-project" })
    expect(classifyImageSource("../other/a.png", dir)).toEqual({ kind: "blocked", reason: "outside-project" })
    expect(classifyImageSource("/Users/me/project-two/a.png", dir)).toEqual({
      kind: "blocked",
      reason: "outside-project",
    })
    expect(classifyImageSource("designs/a.png")).toEqual({ kind: "blocked", reason: "outside-project" })
  })

  test("refuses non-image files and other schemes", () => {
    expect(classifyImageSource("src/secrets.env", dir)).toEqual({ kind: "blocked", reason: "not-image" })
    expect(classifyImageSource("javascript:alert(1)", dir).kind).toBe("blocked")
    expect(isImagePath("a/b.WEBP")).toBe(true)
    expect(isImagePath("a.svg/readme")).toBe(false)
  })

  test("turns a complete svg code block into an image, and nothing else", () => {
    const url = svgCodeToDataUrl('<svg viewBox="0 0 10 10"><circle r="4"/></svg>')
    expect(url?.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true)
    expect(decodeURIComponent(url!.split(",")[1]!)).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svgCodeToDataUrl('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeDefined()
    expect(svgCodeToDataUrl("<svg viewBox='0 0 10 10'><circle")).toBeUndefined()
    expect(svgCodeToDataUrl("const x = 1")).toBeUndefined()
  })

  test("builds image URLs from the project file reader's answer", () => {
    expect(projectFileToDataUrl("a.png", { content: "AAAA", encoding: "base64", mimeType: "image/png" })).toBe(
      "data:image/png;base64,AAAA",
    )
    expect(projectFileToDataUrl("a.svg", { content: "<svg></svg>" })?.startsWith("data:image/svg+xml")).toBe(true)
    expect(projectFileToDataUrl("a.png", { content: "" })).toBeUndefined()
    expect(projectFileToDataUrl("a.png", undefined)).toBeUndefined()
  })

  test("previews only svg files a Write call created", () => {
    expect(writtenImageUrl("icons/a.svg", "<svg></svg>")).toBeDefined()
    expect(writtenImageUrl("icons/a.ts", "<svg></svg>")).toBeUndefined()
    expect(writtenImageUrl("icons/a.svg", undefined)).toBeUndefined()
  })

  test("a question choice's picture can be svg markup, a project image or a URL", async () => {
    const svg = optionImageSource('<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>', dir)
    expect(svg.kind).toBe("url")
    expect(optionImageSource("designs/b.png", dir)).toEqual({ kind: "project", path: "designs/b.png" })
    expect(optionImageSource("/tmp/b.png", dir).kind).toBe("blocked")
    expect(optionImageSource("<div>not a picture</div>", dir).kind).toBe("blocked")

    const reads: string[] = []
    const read = async (path: string) => {
      reads.push(path)
      return { content: "AAAA", encoding: "base64", mimeType: "image/png" }
    }
    expect(await loadImageSource({ kind: "project", path: "designs/b.png" }, read)).toBe("data:image/png;base64,AAAA")
    expect(await loadImageSource({ kind: "blocked", reason: "outside-project" }, read)).toBeUndefined()
    expect(reads).toEqual(["designs/b.png"])
    expect(await loadImageSource({ kind: "project", path: "x.png" }, async () => Promise.reject(new Error("gone")))).toBeUndefined()
  })
})
