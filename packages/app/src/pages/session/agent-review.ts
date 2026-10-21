/** What "Review before commit" shows: each uncommitted file's warnings, its group, and which files get committed. */

export type ChangeFile = {
  file: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
  untracked?: boolean
  binary?: boolean
  size?: number
  patch?: string
}

export type ChangeStatus = "untracked" | "added" | "deleted" | "modified"

/** red: likely a secret or local tool settings; orange: build output, large, or not changed by this session. */
export type Warning = {
  kind: "secret" | "artifact" | "large" | "outside" | "ai"
  level: "red" | "orange"
  reason?: string
}

export type Group = { title?: string; files: string[] }

export type Review = { message: string; summary: string; groups: Group[]; warnings: Record<string, string[]> }

export const LARGE = 1024 * 1024

export const changeStatus = (file: ChangeFile): ChangeStatus =>
  file.untracked ? "untracked" : (file.status ?? "modified")

const SECRET_DIRS = new Set([".cursor", ".claude"])
const ARTIFACT_DIRS = new Set(["dist", "build", "out", "target", "node_modules"])
const ARTIFACT_EXT = /\.(dmg|exe|zip|jar|log)$/i
const SECRET_NAME = /^\.env|\.(pem|key)$|credentials|secret|^id_rsa/i
const SECRET_TEXT = [
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /password\s*[=:]\s*\S+/i,
]

const parts = (file: string) => file.split(/[\\/]/).filter(Boolean)

/** Lines a patch adds, without the leading "+". */
const added = (patch: string | undefined) =>
  (patch ?? "").split("\n").flatMap((line) => (line.startsWith("+") && !line.startsWith("+++") ? [line.slice(1)] : []))

/** Whether two paths name the same file, allowing one to be relative to a subfolder of the other's root. */
const same = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a)

export const inSession = (file: string, sessionFiles: readonly string[]) =>
  sessionFiles.some((item) => same(file, item))

/** The deterministic warnings for one file; `sessionFiles` are the files this session's replies changed. */
export function fileWarnings(file: ChangeFile, sessionFiles: readonly string[]): Warning[] {
  const segs = parts(file.file)
  const name = segs.at(-1) ?? file.file
  const out: Warning[] = []
  const deleted = file.status === "deleted"
  if (!deleted) {
    const secretPath = SECRET_NAME.test(name) || SECRET_DIRS.has(segs[0] ?? "")
    const secretText = !file.binary && added(file.patch).some((line) => SECRET_TEXT.some((rule) => rule.test(line)))
    if (secretPath || secretText) out.push({ kind: "secret", level: "red" })
    if (segs.slice(0, -1).some((seg) => ARTIFACT_DIRS.has(seg)) || ARTIFACT_EXT.test(name))
      out.push({ kind: "artifact", level: "orange" })
    if ((file.size ?? 0) > LARGE) out.push({ kind: "large", level: "orange" })
  }
  if (!inSession(file.file, sessionFiles)) out.push({ kind: "outside", level: "orange" })
  return out
}

/** Secrets and build output start unchecked; everything else starts checked. */
export const checkedByDefault = (warnings: readonly Warning[]) =>
  !warnings.some((item) => item.kind === "secret" || item.kind === "artifact")

/** The fallback grouping when the AI gives none: by top folder, files at the top level last. */
export function folderGroups(files: readonly string[]): Group[] {
  const map = new Map<string, string[]>()
  for (const file of files) {
    const segs = parts(file)
    const key = segs.length > 1 ? segs[0]! : ""
    map.set(key, [...(map.get(key) ?? []), file])
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([title, list]) => ({ title: title || undefined, files: list }))
}

const LIMIT = 24000

/** The prompt that asks the AI for a commit message, a short summary, a grouping by purpose and any extra warnings. */
export function reviewPrompt(files: readonly ChangeFile[]) {
  const list = files
    .map(
      (item) =>
        `- ${item.file} [${changeStatus(item)}${item.binary ? ", binary" : `, +${item.additions} -${item.deletions}`}]`,
    )
    .join("\n")
  const diff = files
    .filter((item) => !item.binary)
    .map((item) => `--- ${item.file}\n${item.patch ?? ""}`)
    .join("\n")
    .slice(0, LIMIT)
  return [
    "Review these uncommitted changes before they are committed.",
    'Reply with JSON only, no code fences, in this shape: {"message": string, "summary": string, "groups": [{"title": string, "files": string[]}], "warnings": [{"file": string, "reason": string}]}',
    "- message: a git commit message, a concise imperative subject under 72 characters, optionally a blank line and a short bullet list.",
    "- summary: what the changes do, in 2 to 4 plain sentences for a non-programmer.",
    "- groups: every file exactly once, grouped by purpose, each group with a short title.",
    "- warnings: only files that should probably not be committed (secrets, local settings, generated output, unrelated changes), with a short reason. Empty if none.",
    "",
    "Files:",
    list,
    "",
    "Diff:",
    diff,
  ].join("\n")
}

/** Reads the AI's JSON reply; files it does not mention go into a last group without a title. Undefined when unreadable. */
export function parseReview(text: string, files: readonly string[]): Review | undefined {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) return
  const value = (() => {
    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown
    } catch {
      return undefined
    }
  })()
  if (!value || typeof value !== "object") return
  const raw = value as Record<string, unknown>
  const known = new Set(files)
  const seen = new Set<string>()
  const groups: Group[] = (Array.isArray(raw.groups) ? raw.groups : []).flatMap((group) => {
    if (!group || typeof group !== "object") return []
    const item = group as Record<string, unknown>
    const list = (Array.isArray(item.files) ? item.files : []).filter(
      (file): file is string => typeof file === "string" && known.has(file) && !seen.has(file) && !!seen.add(file),
    )
    if (list.length === 0) return []
    return [{ title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined, files: list }]
  })
  const rest = files.filter((file) => !seen.has(file))
  if (rest.length > 0) groups.push({ files: rest })
  const warnings: Record<string, string[]> = {}
  for (const item of Array.isArray(raw.warnings) ? raw.warnings : []) {
    if (!item || typeof item !== "object") continue
    const { file, reason } = item as Record<string, unknown>
    if (typeof file !== "string" || !known.has(file) || typeof reason !== "string" || !reason.trim()) continue
    ;(warnings[file] ??= []).push(reason.trim())
  }
  return {
    message: typeof raw.message === "string" ? raw.message.trim() : "",
    summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    groups,
    warnings,
  }
}

/** The files that get staged and committed: the checked ones, in list order, nothing else. */
export const filesToCommit = (files: readonly string[], checked: Readonly<Record<string, boolean | undefined>>) =>
  files.filter((file) => checked[file])

export const canCommit = (files: readonly string[], message: string) => files.length > 0 && message.trim().length > 0
