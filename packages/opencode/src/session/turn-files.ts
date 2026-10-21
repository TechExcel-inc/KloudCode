import path from "path"

/**
 * Which of a turn's snapshot changes the turn's own AI made. The snapshot diff compares the whole
 * folder before and after the turn, so it also catches files changed by another session, the person
 * or another tool meanwhile. A change is kept only when the turn's file tools touched that file, or
 * when one of its shell commands names the file (its path or its file name).
 */
export namespace TurnFiles {
  export const FILE_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch", "patch"])
  export const SHELL_TOOLS = new Set(["bash"])

  export type Touched = { files: string[]; commands: string[] }

  type ToolLike = { type: string; tool?: string; state?: { input?: unknown; metadata?: unknown } }

  function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
  }

  function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined
  }

  /** File paths named in an apply_patch body ("*** Update File: a.ts", "*** Move to: b.ts"). */
  export function patchPaths(body: string) {
    const out: string[] = []
    for (const line of body.split("\n")) {
      const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s*(.+?)\s*$/) ?? line.match(/^\*\*\*\s+Move to:\s*(.+?)\s*$/)
      if (match?.[1]) out.push(match[1])
    }
    return out
  }

  /** The files the turn's file tools touched and the shell commands it ran, from its parts. */
  export function collect(parts: readonly ToolLike[]): Touched {
    const files: string[] = []
    const commands: string[] = []
    for (const part of parts) {
      if (part.type !== "tool" || !part.tool) continue
      const input = record(part.state?.input) ? part.state.input : {}
      const metadata = record(part.state?.metadata) ? part.state.metadata : {}
      if (SHELL_TOOLS.has(part.tool)) {
        const command = text(input.command)
        if (command) commands.push(command)
        continue
      }
      if (!FILE_TOOLS.has(part.tool)) continue
      for (const key of ["filePath", "file_path", "path"]) {
        const value = text(input[key])
        if (value) files.push(value)
      }
      const body = text(input.patchText) ?? text(input.patch)
      if (body) files.push(...patchPaths(body))
      if (Array.isArray(metadata.files)) {
        for (const item of metadata.files) {
          if (!record(item)) continue
          for (const key of ["filePath", "movePath"]) {
            const value = text(item[key])
            if (value) files.push(value)
          }
        }
      }
    }
    return { files, commands }
  }

  const slash = (value: string) => value.replaceAll("\\", "/")

  /** A tool path as a path relative to the worktree, the way snapshot diffs name files. */
  export function relative(file: string, input: { worktree: string; directory: string }) {
    const absolute = path.isAbsolute(file) ? file : path.resolve(input.directory, file)
    return slash(path.relative(input.worktree, absolute))
  }

  const word = /[A-Za-z0-9_\-]/

  /** True when `needle` appears in `haystack` and is not part of a longer name. */
  function mentions(haystack: string, needle: string) {
    if (!needle) return false
    let from = 0
    while (true) {
      const at = haystack.indexOf(needle, from)
      if (at < 0) return false
      const before = haystack[at - 1]
      const after = haystack[at + needle.length]
      const okBefore = before === undefined || (!word.test(before) && before !== ".")
      const okAfter = after === undefined || !word.test(after)
      if (okBefore && okAfter) return true
      from = at + 1
    }
  }

  /** Keeps only the diff entries this turn's AI changed. */
  export function filter<T extends { file: string }>(
    diffs: readonly T[],
    touched: Touched,
    input: { worktree: string; directory: string },
  ): T[] {
    const own = new Set(touched.files.map((file) => relative(file, input)))
    const inDir = slash(path.relative(input.worktree, input.directory))
    const commands = touched.commands.map(slash)
    return diffs.filter((diff) => {
      const file = slash(diff.file)
      if (own.has(file)) return true
      if (!commands.length) return false
      const local = inDir && file.startsWith(`${inDir}/`) ? file.slice(inDir.length + 1) : file
      const name = file.split("/").pop() ?? file
      const absolute = slash(path.join(input.worktree, file))
      return commands.some(
        (command) =>
          mentions(command, absolute) || mentions(command, file) || mentions(command, local) || mentions(command, name),
      )
    })
  }

  /**
   * Which requested files a discard may restore: only files in this turn's change list and inside the
   * session folder. Everything else is refused. Paths come back relative to the worktree.
   */
  export function discardPlan(
    files: readonly string[],
    turn: readonly { file: string }[],
    input: { worktree: string; directory: string },
  ) {
    const listed = new Set(turn.map((diff) => slash(diff.file)))
    const allowed: string[] = []
    const refused: string[] = []
    for (const file of files) {
      const rel = path.isAbsolute(file) ? relative(file, input) : slash(file)
      const absolute = path.resolve(input.worktree, rel)
      const inside = slash(path.relative(input.directory, absolute))
      const outside = !inside || inside === ".." || inside.startsWith("../") || path.isAbsolute(inside)
      if (outside || !listed.has(rel)) {
        refused.push(file)
        continue
      }
      if (!allowed.includes(rel)) allowed.push(rel)
    }
    return { allowed, refused }
  }
}
