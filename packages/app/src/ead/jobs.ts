import { EAD_ORIGIN } from "./urls"

export type JobCounts = {
  created: number
  updated: number
  linked: number
  deleted: number
  warnings: number
}

function post(frame: HTMLIFrameElement | undefined, payload: Record<string, unknown>) {
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage({ source: "ead-pfm-host", ...payload }, EAD_ORIGIN)
}

export function formatJobCounts(counts: JobCounts) {
  const note = counts.warnings > 0 ? ` (${counts.warnings} note${counts.warnings === 1 ? "" : "s"})` : ""
  return `AI coding jobs updated: +${counts.created} new, ~${counts.updated} improved, ${counts.linked} linked, ${counts.deleted} removed${note}.`
}

export function postLifecycle(
  frame: HTMLIFrameElement | undefined,
  requestId: string,
  stage: string,
  message: string,
) {
  post(frame, {
    type: "cursorAiCodingJobsLifecycle",
    requestId,
    stage,
    message,
  })
}

export function postJobResult(
  frame: HTMLIFrameElement | undefined,
  requestId: string,
  ok: boolean,
  message: string,
) {
  post(frame, {
    type: "cursorAiCodingJobsResult",
    requestId,
    ok,
    message,
  })
}

export function postJobsRefresh(frame: HTMLIFrameElement | undefined, pfmNodeId?: number | null) {
  post(frame, {
    type: "aiJobsRefresh",
    pfmNodeId: pfmNodeId ?? null,
  })
}

export function postTestsRefresh(frame: HTMLIFrameElement | undefined, pfmNodeId?: number | null) {
  post(frame, {
    type: "testCasesRefresh",
    pfmNodeId: pfmNodeId ?? null,
  })
}
