/** Cursor extension 1.0.222 — MCP writes this; host forwards into Pilot iframe. */
export const SIGNAL = ".eadpfm/auto-improve-step-complete.json"

export type Step = {
  type: "autoImproveStepComplete" | "aiFindStepComplete"
  pfmNodeId: number | null
  reason: string
  at: string
}

export function parseStep(raw: unknown): Step | undefined {
  if (!raw || typeof raw !== "object") return
  const row = raw as Record<string, unknown>
  const type = String(row.type || "autoImproveStepComplete")
  if (type !== "autoImproveStepComplete" && type !== "aiFindStepComplete") return
  const nid = Number(row.pfmNodeId)
  return {
    type,
    pfmNodeId: Number.isFinite(nid) && nid > 0 ? nid : null,
    reason: typeof row.reason === "string" && row.reason.trim() ? row.reason : "signal_file",
    at: typeof row.at === "string" ? row.at.trim() : "",
  }
}

export function parseBody(text: string): Step | undefined {
  const raw = text.trim()
  if (!raw) return
  try {
    return parseStep(JSON.parse(raw) as unknown)
  } catch {
    return
  }
}

export function matches(path: string) {
  return path.replace(/\\/g, "/").endsWith(SIGNAL)
}

/**
 * Skip leftover files from a previous run; fire on create/change after first observation.
 * 1500ms burst window matches Cursor extension.
 */
export function watch() {
  let ready = false
  let lastAt = ""
  let lastFire = Number.NEGATIVE_INFINITY
  return {
    miss() {
      ready = true
    },
    hit(step: Step, now = Date.now()) {
      if (!ready) {
        ready = true
        lastAt = step.at
        return false
      }
      if (step.at && step.at === lastAt) return false
      if (now - lastFire < 1500) return false
      lastAt = step.at || String(now)
      lastFire = now
      return true
    },
  }
}
