import { EAD_ORIGIN, EAD_SERVER_URL } from "./urls"

export type PilotContext = {
  productId?: number
  productName?: string
  nodeId?: number
  nodeName?: string
  mapId?: number
  openAiPilot?: boolean
  language?: "en" | "zh"
  bust?: number
}

export function buildPilotUrl(ctx: PilotContext) {
  const url = new URL(`${EAD_SERVER_URL}/plugin/ai-code`)
  url.searchParams.set("mode", "cursor")
  if (ctx.productId && ctx.productId > 0) url.searchParams.set("productId", String(ctx.productId))
  if (ctx.productName) url.searchParams.set("productName", ctx.productName)
  if (ctx.nodeId && ctx.nodeId > 0) {
    url.searchParams.set("pfmNodeId", String(ctx.nodeId))
    url.searchParams.set("nodeId", String(ctx.nodeId))
  }
  if (ctx.nodeName) {
    url.searchParams.set("entityName", ctx.nodeName)
  }
  if (ctx.mapId && ctx.mapId > 0) url.searchParams.set("mapId", String(ctx.mapId))
  if (ctx.openAiPilot) url.searchParams.set("openAiPilot", "1")
  if (ctx.language) url.searchParams.set("lang", ctx.language)
  if (ctx.bust) url.searchParams.set("_t", String(ctx.bust))
  return url.toString()
}

export function postToFrame(frame: HTMLIFrameElement | undefined, payload: Record<string, unknown>) {
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage({ source: "ead-pfm-host", ...payload }, EAD_ORIGIN)
}

/** Match Cursor shell: iframe listens for authTokenSync / authSyncComplete. */
export function syncAuth(frame: HTMLIFrameElement | undefined, token: string) {
  postToFrame(frame, { type: "authTokenSync", token: token || "" })
  postToFrame(frame, { type: "authSyncComplete", hasToken: Boolean(token), token: token || "" })
  postToFrame(frame, { type: "eadPfmSyncAuthToken", token: token || "" })
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

export function setUiLanguage(frame: HTMLIFrameElement | undefined, language: "en" | "zh") {
  postToFrame(frame, { type: "setUiLanguage", language })
}

export function pingHost(frame: HTMLIFrameElement | undefined) {
  postToFrame(frame, { type: "hostHealthCheck", ts: Date.now() })
}

export function requestSessionSync(frame: HTMLIFrameElement | undefined) {
  postToFrame(frame, { type: "requestPluginSessionSync" })
}

export function isEadOrigin(origin: string) {
  return origin === EAD_ORIGIN
}

export function handlePluginMessage(
  msg: Record<string, unknown>,
  hooks: {
    setToken: (token: string) => void
  },
) {
  const type = String(msg.type || "")
  if (
    (type === "eadPfmPersistAuthToken" ||
      type === "authSyncComplete" ||
      type === "pluginSessionSync" ||
      type === "cursorAuthToken") &&
    typeof msg.token === "string" &&
    msg.token.trim()
  ) {
    hooks.setToken(msg.token)
    return true
  }
  if (type === "pluginHeartbeat") return true
  return false
}
