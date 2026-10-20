import type { Part } from "@opencode-ai/sdk/v2/client"

export type OutputGroup = "code" | "documents" | "images" | "pages"

export type Output = {
  path: string
  group: OutputGroup
  time: number
}

export const OUTPUT_GROUPS: OutputGroup[] = ["code", "documents", "images", "pages"]

const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"])
const DOCUMENTS = new Set(["md", "mdx", "txt", "pdf", "doc", "docx", "rtf", "csv", "xlsx", "pptx", "odt"])
const PAGES = new Set(["html", "htm"])

export function outputGroup(path: string): OutputGroup {
  const name = path.split(/[\\/]/).pop() ?? path
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
  if (IMAGES.has(ext)) return "images"
  if (DOCUMENTS.has(ext)) return "documents"
  if (PAGES.has(ext)) return "pages"
  return "code"
}

/** The files a finished tool call created or edited; deleted files are left out. */
function written(part: Part): string[] {
  if (part.type !== "tool" || part.state.status !== "completed") return []
  const input = part.state.input as Record<string, unknown>
  if (part.tool === "write" || part.tool === "edit" || part.tool === "multiedit") {
    return typeof input.filePath === "string" ? [input.filePath] : []
  }
  if (part.tool === "apply_patch") {
    const files = (part.state.metadata as { files?: unknown } | undefined)?.files
    if (!Array.isArray(files)) return []
    return files.flatMap((file: { filePath?: unknown; movePath?: unknown; type?: unknown }) => {
      if (file.type === "delete") return []
      const target = typeof file.movePath === "string" ? file.movePath : file.filePath
      return typeof target === "string" ? [target] : []
    })
  }
  return []
}

/**
 * Every file the AI created or edited in a session, wherever it is on disk, newest first. A file
 * edited several times is listed once, at its latest edit.
 */
export function sessionOutputs(parts: Part[]): Output[] {
  const latest = new Map<string, number>()
  for (const part of parts) {
    if (part.type !== "tool" || part.state.status !== "completed") continue
    const time = part.state.time.end
    for (const path of written(part)) {
      if ((latest.get(path) ?? 0) < time) latest.set(path, time)
    }
  }
  return [...latest]
    .map(([path, time]) => ({ path, group: outputGroup(path), time }))
    .sort((a, b) => b.time - a.time)
}
