import { getFilename } from "@opencode-ai/util/path"
import { type Session } from "@opencode-ai/sdk/v2/client"

type SessionStore = {
  session?: Session[]
  path: { directory: string }
}

export const workspaceKey = (directory: string) => {
  const value = directory.replaceAll("\\", "/")
  const drive = value.match(/^([A-Za-z]:)\/+$/)
  if (drive) return `${drive[1]}/`
  if (/^\/+$/i.test(value)) return "/"
  return value.replace(/\/+$/, "")
}

function sortSessions(now: number) {
  const oneMinuteAgo = now - 60 * 1000
  return (a: Session, b: Session) => {
    const aUpdated = a.time.updated ?? a.time.created
    const bUpdated = b.time.updated ?? b.time.created
    const aRecent = aUpdated > oneMinuteAgo
    const bRecent = bUpdated > oneMinuteAgo
    if (aRecent && bRecent) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    if (aRecent && !bRecent) return -1
    if (!aRecent && bRecent) return 1
    return bUpdated - aUpdated
  }
}

const isRootVisibleSession = (session: Session, directory: string) =>
  workspaceKey(session.directory) === workspaceKey(directory) && !session.parentID && !session.time?.archived

const roots = (store: SessionStore) =>
  (store.session ?? []).filter((session) => isRootVisibleSession(session, store.path.directory))

export const sortedRootSessions = (store: SessionStore, now: number) => roots(store).sort(sortSessions(now))

export const latestRootSession = (stores: SessionStore[], now: number) =>
  stores.flatMap(roots).sort(sortSessions(now))[0]

export function hasProjectPermissions<T>(
  request: Record<string, T[] | undefined> | undefined,
  include: (item: T) => boolean = () => true,
) {
  return Object.values(request ?? {}).some((list) => list?.some(include))
}

export const childSessionOnPath = (sessions: Session[] | undefined, rootID: string, activeID?: string) => {
  if (!activeID || activeID === rootID) return
  const map = new Map((sessions ?? []).map((session) => [session.id, session]))
  let id = activeID

  while (id) {
    const session = map.get(id)
    if (!session?.parentID) return
    if (session.parentID === rootID) return session
    id = session.parentID
  }
}

// A root folder such as "/" has no last segment, so fall back to its path rather than a blank name.
export const displayName = (project: { name?: string; worktree: string }) =>
  project.name || getFilename(project.worktree) || project.worktree

/**
 * Projects whose sessions the sidebar lists: the current project first, then the projects associated
 * with it, in sidebar order. Associated projects only add their sessions to the list; sessions still
 * run in their own project. With no current project every open project is listed.
 */
export const scoped = <T extends { worktree: string }>(list: T[], root: string | undefined, linked: string[]) => {
  const main = root ? list.find((item) => workspaceKey(item.worktree) === workspaceKey(root)) : undefined
  if (!main) return list
  const keys = new Set(linked.map(workspaceKey))
  return [main, ...list.filter((item) => item !== main && keys.has(workspaceKey(item.worktree)))]
}

export const errorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data
    if (data?.message) return data.message
  }
  if (err instanceof Error) return err.message
  return fallback
}

export const effectiveWorkspaceOrder = (local: string, dirs: string[], persisted?: string[]) => {
  const root = workspaceKey(local)
  const live = new Map<string, string>()

  for (const dir of dirs) {
    const key = workspaceKey(dir)
    if (key === root) continue
    if (!live.has(key)) live.set(key, dir)
  }

  if (!persisted?.length) return [local, ...live.values()]

  const result = [local]
  for (const dir of persisted) {
    const key = workspaceKey(dir)
    if (key === root) continue
    const match = live.get(key)
    if (!match) continue
    result.push(match)
    live.delete(key)
  }

  return [...result, ...live.values()]
}

export type SessionGroup = "today" | "yesterday" | "week" | "older"

const DAY = 24 * 60 * 60 * 1000

export function groupSessions(list: Session[], now: number) {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const start = day.getTime()
  const bucket = (session: Session): SessionGroup => {
    const time = session.time.updated ?? session.time.created
    if (time >= start) return "today"
    if (time >= start - DAY) return "yesterday"
    if (time >= start - 6 * DAY) return "week"
    return "older"
  }
  const order: SessionGroup[] = ["today", "yesterday", "week", "older"]
  return order
    .map((key) => ({ key, items: list.filter((session) => bucket(session) === key) }))
    .filter((group) => group.items.length > 0)
}

export function ago(time: number, now: number, locale: string) {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" })
  const secs = Math.round((time - now) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ]
  const hit = units.find((unit) => Math.abs(secs) >= unit[1])
  if (!hit) return format.format(0, "minute")
  return format.format(Math.round(secs / hit[1]), hit[0])
}

export type RecentProject = { worktree: string; name: string; project?: { name?: string; worktree: string } }

/**
 * Turns recorded folders (newest first) into one entry per project root. A folder inside a known
 * project's sandboxes counts as that project; `skip` drops roots such as the current project.
 */
export const recentProjects = (
  rows: { directory: string }[],
  projects: { name?: string; worktree: string; sandboxes?: string[] }[],
  skip: string[] = [],
): RecentProject[] => {
  const seen = new Set(skip.map(workspaceKey))
  return rows.flatMap((row) => {
    const key = workspaceKey(row.directory)
    const project = projects.find(
      (item) => workspaceKey(item.worktree) === key || item.sandboxes?.some((dir) => workspaceKey(dir) === key),
    )
    const worktree = project && project.worktree !== "/" ? project.worktree : row.directory
    const root = workspaceKey(worktree)
    if (seen.has(root)) return []
    seen.add(root)
    const name = project && project.worktree !== "/" ? displayName(project) : getFilename(worktree) || worktree
    return [{ worktree, name, project: project && project.worktree !== "/" ? project : undefined }]
  })
}
