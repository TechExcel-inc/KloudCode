import { eadOrigin, eadServer, EAD_PILOT_ID, EAD_PILOT_WIDTH, isEadHost } from "./urls"
import type { PilotAction } from "./actions"
import type { Lang } from "./i18n"
import type { Step } from "./step-signal"

export type PilotContext = {
  productId?: number
  productName?: string
  nodeId?: number
  nodeName?: string
  sourceId?: number
  sourceName?: string
  sourcePath?: string
  mapId?: number
  subSchemaId?: number
  openAiPilot?: boolean
  openAiFind?: boolean
  openSetup?: boolean
  openSetupEadMap?: boolean
  openPfmFilter?: boolean
  openCrawlVision?: boolean
  helpTipId?: string
  language?: Lang
  mode?: "opencode" | "cursor"
  bust?: number
}

export type SourceOpts = {
  productId?: number
  productName?: string
  sourceId?: number
  sourcePath?: string
  sourceName?: string
  linkedPaths?: string[]
}

export type BridgeHooks = {
  setToken: (token: string) => void
  setProduct?: (id: number, name: string) => void
  setNode?: (id: number, name: string) => void
  setSource?: (id: number, name: string, path?: string) => void
  setWorkContext?: (id: number) => void
  clearToken?: () => void
  bumpMap?: () => void
  bumpPilot?: () => void
  openPilot?: () => void
  queueFind?: (opts?: SourceOpts) => void
  queueCreate?: (opts?: SourceOpts) => void
  queueSetup?: () => void
  queueSetupSource?: () => void
  queueMindmap?: () => void
  queueCrawl?: () => void
  queueHelp?: (tipId: string) => void
  syncAuth?: () => void
  noteHeartbeat?: () => void
  bridgeReady?: () => void
  openExternal?: (url: string, windowName?: string) => void
  openWebApp?: (opts?: { productId?: number; productName?: string; openEditProduct?: boolean }) => void
  clipboard?: (requestId: string) => void
  writeClipboard?: (requestId: string, text: string) => void
  teamMembers?: (requestId: string, productId: number, token?: string) => void
  inject?: (text: string, label: string) => void
  codingJobs?: (msg: Record<string, unknown>) => void
  reconcile?: (msg: Record<string, unknown>) => void
  ownerOptions?: (msg: Record<string, unknown>) => void
  ownerFilter?: (msg: Record<string, unknown>) => void
  pfmFilter?: (msg: Record<string, unknown>) => void
  stepComplete?: (msg: Record<string, unknown>) => void
}

type Panel = {
  open: (id: string, width?: number) => void
  close: (id: string) => void
  opened: (id: string) => () => boolean
  toggle: (id: string, width?: number) => void
}

/** Open Pilot without remounting a live iframe (keep-alive). */
export function openPilot(panel: Panel, bump?: () => void) {
  const first = !panel.opened(EAD_PILOT_ID)()
  panel.open(EAD_PILOT_ID, EAD_PILOT_WIDTH)
  if (first) bump?.()
}

/** Toggle Pilot; never remount on close. */
export function togglePilot(panel: Panel, bump?: () => void) {
  if (panel.opened(EAD_PILOT_ID)()) {
    panel.close(EAD_PILOT_ID)
    return
  }
  openPilot(panel, bump)
}

export function buildPilotShellUrl(
  ctx: Pick<PilotContext, "productId" | "productName" | "subSchemaId" | "language" | "mode" | "bust">,
) {
  const url = new URL(`${eadServer()}/plugin/ai-code`)
  if (ctx.productId && ctx.productId > 0) url.searchParams.set("productId", String(ctx.productId))
  if (ctx.productName) url.searchParams.set("productName", ctx.productName)
  if (ctx.subSchemaId && ctx.subSchemaId > 0) url.searchParams.set("subSchemaId", String(ctx.subSchemaId))
  url.searchParams.set("mode", ctx.mode === "opencode" ? "opencode" : "cursor")
  if (ctx.language) url.searchParams.set("lang", ctx.language)
  if (ctx.bust) url.searchParams.set("_cb", String(ctx.bust))
  return url.toString()
}

export function buildPilotUrl(ctx: PilotContext) {
  const url = new URL(`${eadServer()}/plugin/ai-code`)
  url.searchParams.set("mode", ctx.mode === "cursor" ? "cursor" : "opencode")
  if (ctx.productId && ctx.productId > 0) url.searchParams.set("productId", String(ctx.productId))
  if (ctx.productName) url.searchParams.set("productName", ctx.productName)
  if (ctx.sourceId && ctx.sourceId > 0) {
    url.searchParams.set("sourceCodeNodeId", String(ctx.sourceId))
    url.searchParams.set("nodeId", String(ctx.sourceId))
    if (ctx.sourceName) url.searchParams.set("entityName", ctx.sourceName)
    if (ctx.sourcePath) url.searchParams.set("sourceCodeNodePath", ctx.sourcePath)
  } else if (ctx.nodeId && ctx.nodeId > 0) {
    url.searchParams.set("pfmNodeId", String(ctx.nodeId))
    url.searchParams.set("nodeId", String(ctx.nodeId))
    if (ctx.nodeName) url.searchParams.set("entityName", ctx.nodeName)
  }
  if (ctx.mapId && ctx.mapId > 0) url.searchParams.set("mapId", String(ctx.mapId))
  if (ctx.subSchemaId && ctx.subSchemaId > 0) url.searchParams.set("subSchemaId", String(ctx.subSchemaId))
  if (ctx.openAiPilot) url.searchParams.set("openAiPilot", "1")
  if (ctx.openAiFind) url.searchParams.set("openAiFind", "1")
  if (ctx.openSetup) url.searchParams.set("openSetup", "1")
  if (ctx.openSetupEadMap) url.searchParams.set("openSetupEadMap", "1")
  if (ctx.openPfmFilter) url.searchParams.set("openPfmFilter", "1")
  if (ctx.openCrawlVision) url.searchParams.set("openCrawlVision", "1")
  if (ctx.helpTipId) url.searchParams.set("openHelpTip", ctx.helpTipId)
  if (ctx.language) url.searchParams.set("lang", ctx.language)
  if (ctx.bust) url.searchParams.set("_cb", String(ctx.bust))
  return url.toString()
}

export function flagsFromAction(action: PilotAction | undefined): Pick<
  PilotContext,
  "openAiPilot" | "openAiFind" | "openSetup" | "openSetupEadMap" | "openPfmFilter" | "openCrawlVision" | "helpTipId"
> {
  if (!action || action.kind === "dashboard") return { openAiPilot: true }
  if (action.kind === "find") return { openAiFind: true }
  if (action.kind === "setupSource") return { openSetup: true }
  if (action.kind === "setup") return { openSetupEadMap: true }
  if (action.kind === "mindmap") return { openPfmFilter: true }
  if (action.kind === "crawl") return { openCrawlVision: true }
  if (action.kind === "help") return { helpTipId: action.tipId || undefined }
  if (action.kind === "pfm" || action.kind === "source") return {}
  return { openAiPilot: true }
}

export function postToFrame(frame: HTMLIFrameElement | undefined, payload: Record<string, unknown>) {
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage({ source: "ead-pfm-host", ...payload }, eadOrigin())
}

/** Cursor 1.0.222 host event — advance Auto Improve / AI Find waiting pages. */
export function postStep(frame: HTMLIFrameElement | undefined, step: Step) {
  postToFrame(frame, {
    type: step.type,
    pfmNodeId: step.pfmNodeId,
    reason: step.reason,
    at: step.at || new Date().toISOString(),
  })
}

/** Match Cursor shell: iframe listens for authTokenSync / authSyncComplete. */
export function syncAuth(frame: HTMLIFrameElement | undefined, token: string) {
  // Empty pushes wipe Pilot localStorage and flash the sign-in modal — skip unless explicit logout.
  const t = token.trim()
  if (!t) return
  postToFrame(frame, { type: "authTokenSync", token: t })
  postToFrame(frame, { type: "authSyncComplete", hasToken: true, token: t })
  postToFrame(frame, { type: "eadPfmSyncAuthToken", token: t })
}

/** Cursor requestAuthSync always ACKs — including empty (hasToken:false). */
export function syncAuthStatus(frame: HTMLIFrameElement | undefined, token: string) {
  const t = token.trim()
  if (t) {
    syncAuth(frame, t)
    return
  }
  postToFrame(frame, { type: "authSyncComplete", hasToken: false, token: "" })
}

export function openPilotDashboard(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string },
) {
  postToFrame(frame, {
    type: "openAiPilotDashboard",
    productId: opts?.productId,
    productName: opts?.productName,
  })
}

export function openFindWizard(frame: HTMLIFrameElement | undefined, opts?: SourceOpts) {
  postToFrame(frame, {
    type: "openAiFindWizard",
    sourceCodeNodeId: opts?.sourceId,
    sourceCodeNodePath: opts?.sourcePath,
    sourceCodeNodeName: opts?.sourceName,
    productId: opts?.productId,
    productName: opts?.productName,
  })
}

export function openAutoCreate(frame: HTMLIFrameElement | undefined, opts?: SourceOpts) {
  postToFrame(frame, {
    type: "openAutoCreateEad",
    sourceCodeNodeId: opts?.sourceId,
    sourceCodeNodePath: opts?.sourcePath,
    sourceCodeNodeName: opts?.sourceName,
    productId: opts?.productId,
    productName: opts?.productName,
  })
}

export function openSetupMap(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string; treeViewMode?: "pfm" | "source" },
) {
  postToFrame(frame, {
    type: "openSetupEadMap",
    productId: opts?.productId,
    productName: opts?.productName,
    treeViewMode: opts?.treeViewMode,
  })
}

export function openSetupSource(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string },
) {
  postToFrame(frame, {
    type: "openSetupSourceTree",
    productId: opts?.productId,
    productName: opts?.productName,
    openSetup: "1",
  })
}

export function openEditProduct(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string },
) {
  postToFrame(frame, {
    type: "openEditProduct",
    productId: opts?.productId,
    productName: opts?.productName,
  })
}

export function openMindmap(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string; treeViewMode?: "pfm" | "source" },
) {
  postToFrame(frame, {
    type: "openNavigatorPfmMindmap",
    productId: opts?.productId,
    productName: opts?.productName,
    treeViewMode: opts?.treeViewMode,
  })
}

export function updateSourceSelection(frame: HTMLIFrameElement | undefined, opts?: SourceOpts) {
  const linked = opts?.linkedPaths?.filter((p) => p.trim().length > 0) ?? []
  postToFrame(frame, {
    type: "updateSourceSelection",
    sourceCodeNodeId: opts?.sourceId,
    sourceCodeNodePath: opts?.sourcePath,
    sourceCodeNodeName: opts?.sourceName,
    sourceLinkedFilePaths: linked.length ? JSON.stringify(linked) : undefined,
    productId: opts?.productId,
    productName: opts?.productName,
    entityName: opts?.sourceName,
    aiCodeView: "1",
  })
}

/** Soft-update Pilot PFM selection without remounting the iframe. */
export function updatePfmSelection(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string; nodeId?: number; nodeName?: string },
) {
  postToFrame(frame, {
    type: "updatePfmSelection",
    productId: opts?.productId,
    productName: opts?.productName,
    pfmNodeId: opts?.nodeId,
    entityName: opts?.nodeName,
    nodeKey: opts?.nodeName,
  })
}

export function openCrawlVision(
  frame: HTMLIFrameElement | undefined,
  opts?: { productId?: number; productName?: string },
) {
  postToFrame(frame, {
    type: "openCrawlVisionWizard",
    productId: opts?.productId,
    productName: opts?.productName,
  })
}

export function openHelpTip(frame: HTMLIFrameElement | undefined, tipId: string) {
  const id = tipId.trim()
  if (!id) return
  postToFrame(frame, { type: "openHelpTip", helpTipId: id })
}

export function selectPfmSubSchema(
  frame: HTMLIFrameElement | undefined,
  opts: { productId: number; subSchemaId: number | null },
) {
  postToFrame(frame, {
    type: "selectPfmSubSchema",
    productId: opts.productId,
    subSchemaId: opts.subSchemaId,
  })
}

export function hostClipboardCommand(
  frame: HTMLIFrameElement | undefined,
  command: "copy" | "cut" | "paste" | "selectAll",
) {
  postToFrame(frame, { type: "hostClipboardCommand", command })
}

export function postOwnerState(
  frame: HTMLIFrameElement | undefined,
  state: Record<string, unknown>,
) {
  postToFrame(frame, { type: "jobOwnerFilterState", ...state })
}

export function postPfmFilterState(frame: HTMLIFrameElement | undefined, state: Record<string, unknown>) {
  postToFrame(frame, { type: "pfmNodeFilterState", ...state })
}

export function postPfmFilterApplied(frame: HTMLIFrameElement | undefined, state: Record<string, unknown>) {
  postToFrame(frame, { type: "pfmNodeFilterApplied", ...state })
}

export function postPfmFilterCleared(frame: HTMLIFrameElement | undefined) {
  postToFrame(frame, { type: "pfmNodeFilterCleared" })
}

export function postOwnerOptions(
  frame: HTMLIFrameElement | undefined,
  requestId: string,
  result: { ok: boolean; message?: string; members: Array<{ email: string; label: string }> },
) {
  postToFrame(frame, {
    type: "jobOwnerFilterOptions",
    requestId,
    ok: result.ok,
    message: result.message,
    members: result.members,
  })
}

export function applyPilotAction(
  frame: HTMLIFrameElement | undefined,
  action: PilotAction | undefined,
  product: { productId?: number; productName?: string; treeViewMode?: "pfm" | "source" },
) {
  const opts = {
    productId: product.productId,
    productName: product.productName,
    sourceId: action?.sourceId,
    sourcePath: action?.sourcePath,
    sourceName: action?.sourceName,
    linkedPaths: action?.linkedPaths,
  }
  if (!action || action.kind === "dashboard") {
    openPilotDashboard(frame, product)
    return
  }
  if (action.kind === "find") {
    openFindWizard(frame, opts)
    return
  }
  if (action.kind === "create") {
    openAutoCreate(frame, opts)
    return
  }
  if (action.kind === "setup") {
    openSetupMap(frame, { ...product, treeViewMode: product.treeViewMode })
    return
  }
  if (action.kind === "setupSource") {
    openSetupSource(frame, product)
    return
  }
  if (action.kind === "editProduct") {
    openEditProduct(frame, product)
    return
  }
  if (action.kind === "source") {
    updateSourceSelection(frame, opts)
    return
  }
  if (action.kind === "pfm") {
    updatePfmSelection(frame, {
      productId: product.productId,
      productName: product.productName,
      nodeId: action.nodeId,
      nodeName: action.nodeName,
    })
    return
  }
  if (action.kind === "crawl") {
    openCrawlVision(frame, product)
    return
  }
  if (action.kind === "help") {
    openHelpTip(frame, action.tipId || "")
    return
  }
  if (action.kind === "mindmap") {
    openMindmap(frame, product)
    return
  }
  openPilotDashboard(frame, product)
}

export function setUiLanguage(frame: HTMLIFrameElement | undefined, language: Lang) {
  postToFrame(frame, { type: "setUiLanguage", language })
}

export function pingHost(frame: HTMLIFrameElement | undefined) {
  postToFrame(frame, { type: "hostHealthCheck", ts: Date.now() })
}

export function requestSessionSync(frame: HTMLIFrameElement | undefined) {
  postToFrame(frame, { type: "requestPluginSessionSync" })
}

export function replyClipboard(
  frame: HTMLIFrameElement | undefined,
  requestId: string,
  result: { ok: boolean; text?: string; message?: string },
) {
  postToFrame(frame, {
    type: "clipboardTextResult",
    requestId,
    ok: result.ok,
    text: result.text || "",
    message: result.message,
  })
}

export function replyWriteClipboard(
  frame: HTMLIFrameElement | undefined,
  requestId: string,
  result: { ok: boolean; message?: string },
) {
  postToFrame(frame, {
    type: "writeClipboardTextResult",
    requestId,
    ok: result.ok,
    message: result.message,
  })
}

export function replyTeamMembers(
  frame: HTMLIFrameElement | undefined,
  requestId: string,
  result: { ok: boolean; message?: string; members: Array<{ email: string; label: string }> },
) {
  postToFrame(frame, {
    type: "applicableTeamMembersResult",
    requestId,
    ok: result.ok,
    message: result.message,
    members: result.members,
  })
}

export function isEadOrigin(origin: string) {
  return isEadHost(origin)
}

function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function sourceOpts(msg: Record<string, unknown>, fallback?: { productId?: number; productName?: string }): SourceOpts {
  return {
    productId: num(msg.productId) || fallback?.productId,
    productName: text(msg.productName) || fallback?.productName,
    sourceId: num(msg.sourceCodeNodeId ?? msg.nodeId),
    sourcePath: text(msg.sourceCodeNodePath ?? msg.nodePath),
    sourceName: text(msg.sourceCodeNodeName ?? msg.nodeName ?? msg.entityName),
  }
}

export function handlePluginMessage(msg: Record<string, unknown>, hooks: BridgeHooks) {
  const type = String(msg.type || "")

  if (
    (type === "eadPfmPersistAuthToken" || type === "cursorAuthToken") &&
    typeof msg.token === "string" &&
    msg.token.trim()
  ) {
    // Map product is user-controlled — never overwrite from Pilot auth messages.
    hooks.setToken(msg.token)
    return true
  }

  if (type === "pluginSessionSync" || type === "authSyncComplete") {
    // Token-only sync; productId from Pilot must not thrash the Map selection.
    const token = text(msg.token)
    if (token) hooks.setToken(token)
    return true
  }

  if (type === "openCrawlVisionWizard") {
    hooks.openPilot?.()
    hooks.queueCrawl?.()
    return true
  }

  if (type === "openHelpTip") {
    const tipId = text(msg.helpTipId ?? msg.tipId)
    if (tipId) {
      hooks.openPilot?.()
      hooks.queueHelp?.(tipId)
    }
    return true
  }

  if (type === "requestAuthSync") {
    hooks.syncAuth?.()
    return true
  }

  if (type === "openExternalUrl") {
    const url = text(msg.url)
    if (url) hooks.openExternal?.(url, text(msg.windowName) || undefined)
    return true
  }

  if (type === "openEadPilotWebApp") {
    hooks.openWebApp?.({
      productId: num(msg.productId) || undefined,
      productName: text(msg.productName) || undefined,
      openEditProduct: msg.openEditProduct === "1" || msg.openEditProduct === true,
    })
    return true
  }

  if (type === "pluginHeartbeat") {
    hooks.noteHeartbeat?.()
    return true
  }

  if (type === "autoImproveStepComplete" || type === "aiFindStepComplete") {
    hooks.stepComplete?.(msg)
    return true
  }

  if (type === "hostBridgeReady") {
    hooks.noteHeartbeat?.()
    hooks.bridgeReady?.()
    return true
  }

  if (
    type === "setupTreeClosed" ||
    type === "setupTreeSaved" ||
    type === "autoCreateEadSaved" ||
    type === "aiFindApplied" ||
    type === "aiJobsChanged" ||
    type === "aiPromptRegenerated"
  ) {
    hooks.bumpMap?.()
    return true
  }

  if (type === "workContextChanged") {
    const id = num(msg.workContextPfmNodeId ?? msg.pfmNodeId ?? msg.nodeId ?? msg.mapNodeId)
    if (id) {
      hooks.setWorkContext?.(id)
      hooks.bumpMap?.()
    }
    return true
  }

  if (type === "activeNodeChanged" || type === "navigatorPfmMindmapPick") {
    const sourceId = num(msg.sourceCodeNodeId)
    if (sourceId) {
      hooks.setSource?.(
        sourceId,
        text(msg.sourceCodeNodeName ?? msg.entityName ?? msg.nodeName) || `Source ${sourceId}`,
        text(msg.sourceCodeNodePath),
      )
      hooks.bumpMap?.()
      return true
    }
    const id = num(msg.pfmNodeId ?? msg.nodeId ?? msg.mapNodeId)
    const name = text(msg.nodeName ?? msg.title ?? msg.entityName ?? msg.pfmNodeName)
    if (id) {
      hooks.setNode?.(id, name || `Node ${id}`)
      hooks.bumpMap?.()
    }
    return true
  }

  if (type === "openAiPilotDashboard") {
    hooks.openPilot?.()
    return true
  }

  if (type === "openAiFindWizard") {
    hooks.queueFind?.(sourceOpts(msg))
    return true
  }

  if (type === "analyzeCreateEadFromMenu" || type === "openAutoCreateEad") {
    hooks.queueCreate?.(sourceOpts(msg))
    return true
  }

  if (type === "openSetupEadMap") {
    hooks.queueSetup?.()
    return true
  }

  if (type === "openSetupSourceTree") {
    hooks.queueSetupSource?.()
    return true
  }

  if (type === "openNavigatorPfmMindmap") {
    hooks.queueMindmap?.()
    return true
  }

  if (type === "injectAiCodingJobs") {
    hooks.codingJobs?.(msg)
    return true
  }

  if (type === "reconcileAiCodingJobsForNode") {
    hooks.reconcile?.(msg)
    return true
  }

  if (type === "requestJobOwnerFilterOptions") {
    hooks.ownerOptions?.(msg)
    return true
  }

  if (
    type === "setJobOwnerFilterEnabled" ||
    type === "setJobOwnerFilterActive" ||
    type === "applyJobOwnerFilter"
  ) {
    hooks.ownerFilter?.(msg)
    return true
  }

  if (
    type === "clearPfmNodeFilter" ||
    type === "setPfmNodeFilterActive" ||
    type === "pfmNodeFilterState"
  ) {
    hooks.pfmFilter?.(msg)
    return true
  }

  if (type === "requestClipboardText") {
    hooks.clipboard?.(text(msg.requestId))
    return true
  }

  if (type === "writeClipboardText") {
    hooks.writeClipboard?.(text(msg.requestId), typeof msg.text === "string" ? msg.text : "")
    return true
  }

  if (type === "requestApplicableTeamMembers") {
    hooks.teamMembers?.(text(msg.requestId), num(msg.productId), text(msg.token) || undefined)
    return true
  }

  if (
    type === "injectAiFindApi" ||
    type === "injectAiFindSource" ||
    type === "injectCrawlVisionPfm" ||
    type === "injectFieldMapAiFind" ||
    type === "injectImproveTestCases" ||
    type === "injectAiTestCodingJobs"
  ) {
    const playbook = text(msg.playbook)
    if (playbook) hooks.inject?.(playbook, type)
    return true
  }

  if (type === "eadWorkflowContextReady") {
    const id = num(msg.pfmNodeId ?? msg.entityId)
    const name = text(msg.contextLabel ?? msg.title ?? msg.entityName)
    if (id) hooks.setNode?.(id, name || `Node ${id}`)
    return true
  }

  if (type === "focusPfmNavigator" && msg.requireSignIn) {
    hooks.clearToken?.()
    return true
  }

  return false
}
