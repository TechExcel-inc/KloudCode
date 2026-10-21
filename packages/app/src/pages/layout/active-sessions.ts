import type { Message, Part, PermissionRequest, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { currentTask } from "@/pages/session/agent-tasks"
import { workspaceKey } from "./helpers"

export type ActiveState = "working" | "waiting" | "stuck"

/**
 * Why a session wants the person's eye. "working": the AI really runs (a non-idle status somewhere in the
 * tree and nothing asked). "waiting": it waits on the person, for an answer, a permission, or a choice on
 * steps left undone. "stuck": a reply was left unfinished while nothing runs and nothing is asked.
 */
export type SessionAttention =
  | { kind: "working"; cause?: undefined }
  | { kind: "waiting"; cause: "question" | "permission" | "steps" }
  | { kind: "stuck"; cause: "unfinished" }

/** The parts of a directory's sync store that tell whether its sessions are busy or waiting on the user. */
export type ActiveSource = {
  directory: string
  session?: Session[]
  session_status?: Record<string, { type: string } | undefined>
  message?: Record<string, { id?: string; role: string; time?: unknown }[] | undefined>
  permission?: Record<string, PermissionRequest[] | undefined>
  question?: Record<string, QuestionRequest[] | undefined>
  part?: Record<string, Part[] | undefined>
}

/** Whether the person dismissed a session's task (or it closed), so it no longer waits on them. */
export type DismissedTask = (sessionID: string, taskID: string) => boolean

export type ActiveSession<P> = { session: Session; project: P; state: ActiveState; attention: SessionAttention }

/** The session and every descendant (subagent) session below it. */
export function sessionTree(sessions: Session[], sessionID: string) {
  const ids = [sessionID]
  const seen = new Set(ids)
  for (const id of ids) {
    for (const item of sessions) {
      if (item.parentID !== id || seen.has(item.id)) continue
      seen.add(item.id)
      ids.push(item.id)
    }
  }
  return ids
}

const unfinished = (message: { role: string; time?: unknown }) =>
  message.role === "assistant" &&
  typeof (message.time as { completed?: unknown } | undefined)?.completed !== "number"

/** True when the session runs: its status is not idle or an assistant reply has not finished. */
export function sessionBusy(source: ActiveSource, sessionID: string) {
  const status = source.session_status?.[sessionID]
  if (status && status.type !== "idle") return true
  return (source.message?.[sessionID] ?? []).some(unfinished)
}

/** True when the session's task steps are not all done: some are still pending or in progress. */
export function stepsUnfinished(steps: readonly { status: string }[] | undefined) {
  return (steps ?? []).some((step) => step.status === "pending" || step.status === "in_progress")
}

const live = (source: ActiveSource, sessionID: string) => {
  const status = source.session_status?.[sessionID]
  return !!status && status.type !== "idle"
}

// An unfinished reply whose question tool still runs: the AI asked and waits for the answer.
const asking = (source: ActiveSource, sessionID: string) =>
  (source.message?.[sessionID] ?? []).some(
    (message) =>
      unfinished(message) &&
      !!message.id &&
      (source.part?.[message.id] ?? []).some(
        (part) => part.type === "tool" && part.tool === "question" && part.state.status === "running",
      ),
  )

/**
 * The one rule the session header, the sidebar rows and the Active group share, in order: a question for
 * the person anywhere in the tree (a pending request, or a running question tool while the session runs),
 * then a permission request, then real work (a non-idle status), then a reply left unfinished with nothing
 * running ("stuck"), then steps of the current task left undone. `include` drops permission requests that
 * are answered automatically; `dismissed` drops tasks the person dismissed.
 */
export function sessionAttention(
  source: ActiveSource,
  sessionID: string,
  include: (item: PermissionRequest) => boolean = () => true,
  dismissed: DismissedTask = () => false,
): SessionAttention | undefined {
  const ids = sessionTree(source.session ?? [], sessionID)
  if (ids.some((id) => (source.question?.[id]?.length ?? 0) > 0 || (live(source, id) && asking(source, id))))
    return { kind: "waiting", cause: "question" }
  if (ids.some((id) => source.permission?.[id]?.some(include))) return { kind: "waiting", cause: "permission" }
  if (ids.some((id) => live(source, id))) return { kind: "working" }
  if (ids.some((id) => (source.message?.[id] ?? []).some(unfinished))) return { kind: "stuck", cause: "unfinished" }
  const task = currentTask((source.message?.[sessionID] ?? []) as Message[], source.part ?? {})
  if (task && !dismissed(sessionID, task.id) && stepsUnfinished(task.steps)) return { kind: "waiting", cause: "steps" }
}

/** The kind of `sessionAttention`, or undefined when the session needs nothing. */
export function activeState(
  source: ActiveSource,
  sessionID: string,
  include: (item: PermissionRequest) => boolean = () => true,
  dismissed: DismissedTask = () => false,
): ActiveState | undefined {
  return sessionAttention(source, sessionID, include, dismissed)?.kind
}

/**
 * Every root session across the projects' directories that is working or waiting on the user, except
 * the one on screen: that one already shows its own working or waiting state.
 */
export function activeSessions<P>(
  groups: { project: P; sources: ActiveSource[] }[],
  include: (item: PermissionRequest, directory: string) => boolean = () => true,
  onScreen?: string,
  dismissed?: DismissedTask,
): ActiveSession<P>[] {
  const result: ActiveSession<P>[] = []
  for (const group of groups) {
    for (const source of group.sources) {
      for (const session of source.session ?? []) {
        if (session.parentID || session.time?.archived || session.id === onScreen) continue
        if (workspaceKey(session.directory) !== workspaceKey(source.directory)) continue
        const attention = sessionAttention(source, session.id, (item) => include(item, source.directory), dismissed)
        if (attention) result.push({ session, project: group.project, state: attention.kind, attention })
      }
    }
  }
  // Sessions waiting on the user first, then stuck ones, then working ones, each most recently updated first.
  const rank: Record<ActiveState, number> = { waiting: 0, stuck: 1, working: 2 }
  return result.sort((a, b) => {
    if (a.state !== b.state) return rank[a.state] - rank[b.state]
    return (b.session.time.updated ?? b.session.time.created) - (a.session.time.updated ?? a.session.time.created)
  })
}

export type StopStep =
  | { type: "permission"; requestID: string }
  | { type: "question"; requestID: string }
  | { type: "abort"; sessionID: string }

/**
 * What stopping a session takes, in order: reject every pending permission request and question in its
 * tree so nothing waits on the user, then abort each busy subagent and the session itself.
 * The root is always aborted, so a stale "working" state clears even when nothing else is pending.
 */
export function stopSteps(source: ActiveSource, sessionID: string): StopStep[] {
  const ids = sessionTree(source.session ?? [], sessionID)
  const steps: StopStep[] = []
  for (const id of ids) {
    for (const item of source.permission?.[id] ?? []) steps.push({ type: "permission", requestID: item.id })
    for (const item of source.question?.[id] ?? []) steps.push({ type: "question", requestID: item.id })
  }
  for (const id of ids.slice(1).reverse()) {
    if (sessionBusy(source, id)) steps.push({ type: "abort", sessionID: id })
  }
  steps.push({ type: "abort", sessionID })
  return steps
}

export type StopApi = {
  rejectPermission: (requestID: string) => Promise<unknown>
  rejectQuestion: (requestID: string) => Promise<unknown>
  abort: (sessionID: string) => Promise<unknown>
}

/**
 * Runs the steps in order and resolves once every abort call has resolved. A request that is already gone
 * (answered elsewhere) does not block the rest; a failed abort rejects, so the caller does not archive or
 * delete a session that is still running.
 */
export async function runStopSteps(steps: StopStep[], api: StopApi) {
  for (const step of steps) {
    if (step.type === "permission") await api.rejectPermission(step.requestID).catch(() => undefined)
    if (step.type === "question") await api.rejectQuestion(step.requestID).catch(() => undefined)
    if (step.type === "abort") await api.abort(step.sessionID)
  }
}
