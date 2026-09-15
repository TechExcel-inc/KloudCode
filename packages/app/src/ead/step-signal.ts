/** Cursor extension 1.0.238 — MCP writes these; host forwards into Pilot iframe. */
export const SIGNAL = ".eadpfm/auto-improve-step-complete.json"
export const PROGRESS = ".eadpfm/improve-test-cases-progress.json"
export const RESULT = ".eadpfm/improve-test-cases-result.json"

export type Step = {
  type: "autoImproveStepComplete" | "aiFindStepComplete"
  pfmNodeId: number | null
  reason: string
  at: string
}

function nid(raw: unknown) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function at(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

export function parseStep(raw: unknown): Step | undefined {
  if (!raw || typeof raw !== "object") return
  const row = raw as Record<string, unknown>
  const type = String(row.type || "autoImproveStepComplete")
  if (type !== "autoImproveStepComplete" && type !== "aiFindStepComplete") return
  return {
    type,
    pfmNodeId: nid(row.pfmNodeId),
    reason: typeof row.reason === "string" && row.reason.trim() ? row.reason : "signal_file",
    at: at(row.at),
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

export function parseCue(text: string): Record<string, unknown> | undefined {
  const raw = text.trim()
  if (!raw) return
  try {
    const row = JSON.parse(raw) as unknown
    if (!row || typeof row !== "object") return
    return row as Record<string, unknown>
  } catch {
    return
  }
}

export function matches(path: string) {
  const n = path.replace(/\\/g, "/")
  return n.endsWith(SIGNAL) || n.endsWith(PROGRESS) || n.endsWith(RESULT)
}

/**
 * Skip leftover files from a previous run; fire on create/change after first observation.
 * gap matches Cursor startJsonSignalFileWatcher minIntervalMs (auto-improve 200, progress 150, result 0).
 */
export function watch(gap = 200) {
  let ready = false
  let lastAt = ""
  let lastFire = Number.NEGATIVE_INFINITY
  return {
    miss() {
      ready = true
    },
    hit(row: { at: string }, now = Date.now()) {
      if (!ready) {
        ready = true
        lastAt = row.at
        return false
      }
      if (row.at && row.at === lastAt) return false
      if (gap > 0 && now - lastFire < gap) return false
      lastAt = row.at || String(now)
      lastFire = now
      return true
    },
  }
}

export function progress(row: Record<string, unknown>) {
  return {
    type: "improveTestCasesProgress",
    pfmNodeId: nid(row.pfmNodeId),
    phase: row.phase,
    message: row.message,
    kind: row.kind,
    reviewSummary: row.reviewSummary,
    caseAction: row.caseAction,
    caseIndex: row.caseIndex,
    caseTotal: row.caseTotal,
    caseTitle: row.caseTitle,
    at: at(row.at) || new Date().toISOString(),
  }
}

export function result(row: Record<string, unknown>) {
  return {
    type: "cursorImproveTestCasesResult",
    ok: row.ok !== false,
    pfmNodeId: nid(row.pfmNodeId),
    message: row.message,
    reviewSummary: row.reviewSummary,
    applied: row.applied,
    notes: row.notes,
    at: at(row.at) || new Date().toISOString(),
  }
}
