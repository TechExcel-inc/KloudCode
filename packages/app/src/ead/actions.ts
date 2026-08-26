export type PilotAction = {
  kind:
    | "dashboard"
    | "find"
    | "create"
    | "setup"
    | "setupSource"
    | "editProduct"
    | "source"
    | "mindmap"
    | "pfm"
    | "crawl"
    | "help"
  sourceId?: number
  sourcePath?: string
  sourceName?: string
  linkedPaths?: string[]
  nodeId?: number
  nodeName?: string
  tipId?: string
}

type Listener = (action: PilotAction) => void

let pending: PilotAction | undefined
const listeners = new Set<Listener>()

export function queuePilot(next: PilotAction) {
  pending = next
  for (const fn of listeners) fn(next)
}

/** Pilot panel: apply Map-queued actions while iframe is already open. */
export function watchPilot(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function takePilot() {
  const next = pending
  pending = undefined
  return next
}

export function peekPilot() {
  return pending
}
