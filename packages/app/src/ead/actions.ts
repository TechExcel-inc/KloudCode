export type PilotAction = {
  kind: "dashboard" | "find" | "create" | "setup" | "setupSource" | "editProduct" | "source" | "mindmap"
  sourceId?: number
  sourcePath?: string
  sourceName?: string
}

let pending: PilotAction | undefined

export function queuePilot(next: PilotAction) {
  pending = next
}

export function takePilot() {
  const next = pending
  pending = undefined
  return next
}

export function peekPilot() {
  return pending
}
