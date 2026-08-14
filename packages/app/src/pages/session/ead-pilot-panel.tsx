import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useParams } from "@solidjs/router"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { showToast } from "@opencode-ai/ui/toast"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import type { Sizing } from "@/pages/session/helpers"
import { peekPilot, queuePilot, takePilot, type PilotAction } from "@/ead/actions"
import { loadContext, loadTeamMembers, reconcileJobs } from "@/ead/api"
import {
  applyPilotAction,
  buildPilotUrl,
  flagsFromAction,
  handlePluginMessage,
  isEadOrigin,
  openPilot,
  pingHost,
  postOwnerOptions,
  postOwnerState,
  postPfmFilterApplied,
  postPfmFilterCleared,
  postPfmFilterState,
  replyClipboard,
  replyTeamMembers,
  requestSessionSync,
  setUiLanguage,
  syncAuth,
  type SourceOpts,
} from "@/ead/bridge"
import { sendChat } from "@/ead/composer"
import { clearPfmFilter, ownerSummary, readOwner, readPfmFilter, writeOwner, writePfmFilter } from "@/ead/filters"
import { formatJobCounts, postJobResult, postJobsRefresh, postLifecycle, postTestsRefresh } from "@/ead/jobs"
import { useEad } from "@/ead/settings"
import { EAD_PILOT_ID, EAD_PILOT_MAX, EAD_PILOT_MIN, EAD_PILOT_WIDTH, EAD_SERVER_URL } from "@/ead/urls"

const PING_MS = 30_000
const STALE_MS = 90_000
const COOLDOWN_MS = 45_000

function reqId(msg: Record<string, unknown>, prefix: string) {
  const id = typeof msg.requestId === "string" ? msg.requestId.trim() : ""
  return id || `${prefix}-${Date.now()}`
}

function positive(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function EadPilotPanel(props: { sizing: Sizing }) {
  const layout = useLayout()
  const language = useLanguage()
  const prompt = usePrompt()
  const sdk = useSDK()
  const params = useParams()
  const ead = useEad()
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const [frame, setFrame] = createSignal<HTMLIFrameElement>()
  const [beat, setBeat] = createSignal(0)
  const [reloadAt, setReloadAt] = createSignal(0)
  const [action, setAction] = createSignal<PilotAction | undefined>()

  const opened = layout.pluginPanel.opened(EAD_PILOT_ID)
  const width = layout.pluginPanel.width(EAD_PILOT_ID)
  const panelOpen = createMemo(() => isDesktop() && opened())
  const panelWidth = createMemo(() => (panelOpen() ? `${width()}px` : "0px"))

  const src = createMemo(() => {
    const pending = action() ?? peekPilot()
    return buildPilotUrl({
      productId: ead.productId(),
      productName: ead.productName(),
      nodeId: ead.nodeId(),
      nodeName: ead.nodeName(),
      sourceId: pending?.sourceId || ead.sourceId(),
      sourceName: pending?.sourceName || ead.sourceName(),
      sourcePath: pending?.sourcePath || ead.sourcePath(),
      mapId: ead.mapId(),
      language: ead.language(),
      mode: ead.pilotMode(),
      bust: ead.pilotBust(),
      ...flagsFromAction(pending),
    })
  })

  const product = () => ({
    productId: ead.productId() || undefined,
    productName: ead.productName() || undefined,
    treeViewMode: (ead.view() === "source" ? "source" : "pfm") as "pfm" | "source",
  })

  const launch = (next: PilotAction) => {
    queuePilot(next)
    setAction(next)
    openPilot(layout.pluginPanel, () => ead.bumpPilot())
  }

  const chat = async (text: string, auto = true) =>
    sendChat({
      text,
      set: (next) => prompt.set(next),
      client: sdk.client,
      sessionID: params.id,
      auto,
    })

  const push = (el: HTMLIFrameElement | undefined) => {
    if (!el) return
    syncAuth(el, ead.token())
    setUiLanguage(el, ead.language())
    requestSessionSync(el)
    pingHost(el)
    const pending = takePilot() ?? action()
    if (pending) setAction(pending)
    applyPilotAction(el, pending, product())
    const pid = ead.productId()
    if (pid > 0) {
      const owner = readOwner(pid)
      postOwnerState(el, { ...owner, summary: ownerSummary(owner), productId: pid })
      const filter = readPfmFilter()
      postPfmFilterState(el, { active: filter.active, filterIds: filter.ids, productId: pid })
    }
  }

  const runReconcile = async (msg: Record<string, unknown>, requestId: string, el: HTMLIFrameElement | undefined) => {
    const token = ead.token()
    if (!token) throw new Error("Please log in from EAD Map before creating AI coding jobs.")
    const counts = await reconcileJobs(token, {
      pfmNodeId: positive(msg.pfmNodeId),
      sourceCodePfmNodeId: positive(msg.sourceCodePfmNodeId),
      eadEntityId: positive(msg.eadEntityId),
      parentPfmNode: typeof msg.parentPfmNode === "string" ? msg.parentPfmNode : null,
      userDescription: typeof msg.userDescription === "string" ? msg.userDescription : null,
      createTasks: msg.createTasks !== false,
      dryRun: msg.dryRun === true,
    })
    const status = formatJobCounts(counts)
    postJobResult(el, requestId, true, status)
    postJobsRefresh(el, positive(msg.pfmNodeId))
    ead.bumpMap()
    return status
  }

  createEffect(() => {
    if (!panelOpen()) return
    const queued = peekPilot()
    if (queued) setAction(queued)
    const el = frame()
    const token = ead.token()
    const lang = ead.language()
    const bust = ead.pilotBust()
    void token
    void lang
    void bust
    setBeat(Date.now())
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(() => push(el), ms))
    onCleanup(() => timers.forEach((t) => window.clearTimeout(t)))
  })

  createEffect(() => {
    if (!panelOpen()) return
    const timer = window.setInterval(() => {
      const el = frame()
      if (!el) return
      pingHost(el)
      const last = beat()
      if (last <= 0) return
      const now = Date.now()
      if (now - last <= STALE_MS) return
      if (now - reloadAt() < COOLDOWN_MS) return
      setReloadAt(now)
      setBeat(now)
      ead.bumpPilot()
    }, PING_MS)
    onCleanup(() => window.clearInterval(timer))
  })

  createEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isEadOrigin(event.origin)) return
      const data = event.data
      if (!data || typeof data !== "object") return
      const el = frame()
      const msg = data as Record<string, unknown>

      handlePluginMessage(msg, {
        setToken: (token) => ead.setToken(token),
        setProduct: (id, name) => ead.setProduct(id, name),
        setNode: (id, name) => {
          ead.setNode(id, name)
          const token = ead.token()
          if (!token) return
          void loadContext(token, id, name).then((ctx) => {
            ead.setContext({
              nodeName: ctx.nodeName,
              eadScript: ctx.eadScript,
              aiPrompt: ctx.aiPrompt,
              markdown: ctx.markdown,
            })
          })
        },
        setWorkContext: (id) => {
          ead.setWorkContext(id)
        },
        setSource: (id, name, path) => {
          ead.setSource(id, name, path)
          const token = ead.token()
          if (!token) return
          void loadContext(token, id, name, undefined, "source").then((ctx) => {
            ead.setContext({
              nodeName: ctx.nodeName,
              eadScript: ctx.eadScript,
              aiPrompt: ctx.aiPrompt,
              markdown: ctx.markdown,
            })
          })
        },
        clearToken: () => ead.signOut(),
        bumpMap: () => ead.bumpMap(),
        bumpPilot: () => ead.bumpPilot(),
        openPilot: () => launch({ kind: "dashboard" }),
        queueFind: (opts?: SourceOpts) =>
          launch({
            kind: "find",
            sourceId: opts?.sourceId,
            sourcePath: opts?.sourcePath,
            sourceName: opts?.sourceName,
          }),
        queueCreate: (opts?: SourceOpts) =>
          launch({
            kind: "create",
            sourceId: opts?.sourceId,
            sourcePath: opts?.sourcePath,
            sourceName: opts?.sourceName,
          }),
        queueSetup: () => launch({ kind: "setup" }),
        queueSetupSource: () => launch({ kind: "setupSource" }),
        queueMindmap: () => launch({ kind: "mindmap" }),
        syncAuth: () => push(el),
        noteHeartbeat: () => setBeat(Date.now()),
        clipboard: (requestId) => {
          void navigator.clipboard
            .readText()
            .then((text) => replyClipboard(el, requestId, { ok: true, text }))
            .catch((e) =>
              replyClipboard(el, requestId, {
                ok: false,
                message: e instanceof Error ? e.message : "Clipboard read failed.",
              }),
            )
        },
        teamMembers: (requestId, productId, token) => {
          const auth = token || ead.token()
          const pid = productId || ead.productId()
          if (!auth) {
            replyTeamMembers(el, requestId, { ok: false, message: "AUTH_PENDING", members: [] })
            return
          }
          if (pid <= 0) {
            replyTeamMembers(el, requestId, { ok: false, message: "Select a product first.", members: [] })
            return
          }
          void loadTeamMembers(auth, pid)
            .then((members) => replyTeamMembers(el, requestId, { ok: true, members }))
            .catch((e) =>
              replyTeamMembers(el, requestId, {
                ok: false,
                message: e instanceof Error ? e.message : String(e),
                members: [],
              }),
            )
        },
        inject: (text, label) => {
          void chat(text).then((ok) => {
            showToast({
              title: "EAD Pilot",
              description: ok ? `${label} sent to chat.` : `${label} drafted in composer.`,
              variant: "success",
            })
            if (label.includes("Test") || label.includes("test")) postTestsRefresh(el, ead.nodeId() || null)
          })
        },
        codingJobs: (raw) => {
          void (async () => {
            const requestId = reqId(raw, "cursor-ai-jobs")
            if (!ead.token() || !ead.mcpEntry()) {
              const warning = "EAD PFM MCP server is not configured/enabled. Set MCP entry in Settings → EAD."
              postLifecycle(el, requestId, "mcp_not_configured", warning)
              showToast({ title: "EAD", description: warning, variant: "error" })
              return
            }
            const playbook = typeof raw.playbook === "string" ? raw.playbook.trim() : ""
            if (!playbook) {
              postLifecycle(el, requestId, "request_rejected", "AI coding jobs request rejected: playbook is empty.")
              return
            }
            postLifecycle(el, requestId, "request_received", "AI coding jobs request received by plugin.")
            postLifecycle(el, requestId, "dispatching", "Sending AI coding jobs request to chat...")
            const submitted = await chat(playbook)
            postLifecycle(
              el,
              requestId,
              submitted ? "submitted" : "drafted",
              submitted
                ? "AI coding jobs request sent to chat. MCP tools can run now."
                : "AI coding jobs request drafted in chat — review and submit.",
            )
            if (raw.executeReconcile !== true) {
              postLifecycle(el, requestId, "execution_skipped", "AI coding jobs execution skipped (executeReconcile=false).")
              return
            }
            postLifecycle(el, requestId, "executing", "Executing AI coding jobs planning via API...")
            try {
              const status = await runReconcile(raw, requestId, el)
              postLifecycle(el, requestId, "api_success", "AI coding jobs execution finished successfully.")
              showToast({ title: "EAD", description: status, variant: "success" })
            } catch (e) {
              const detail = e instanceof Error ? e.message : "Failed to reconcile AI coding jobs."
              postJobResult(el, requestId, false, detail)
              postLifecycle(el, requestId, "api_failed", `AI coding jobs execution failed: ${detail}`)
              showToast({ title: "EAD", description: detail, variant: "error" })
            }
          })()
        },
        reconcile: (raw) => {
          void (async () => {
            const requestId = reqId(raw, "cursor-ai-jobs")
            try {
              const status = await runReconcile(raw, requestId, el)
              showToast({ title: "EAD", description: status, variant: "success" })
            } catch (e) {
              const detail = e instanceof Error ? e.message : "Failed to reconcile AI coding jobs."
              postJobResult(el, requestId, false, detail)
              showToast({ title: "EAD", description: detail, variant: "error" })
            }
          })()
        },
        ownerOptions: (raw) => {
          const requestId = typeof raw.requestId === "string" ? raw.requestId : ""
          const pid = positive(raw.productId) || ead.productId()
          const token = ead.token()
          if (!token) {
            postOwnerOptions(el, requestId, { ok: false, message: "AUTH_PENDING", members: [] })
            return
          }
          if (pid <= 0) {
            postOwnerOptions(el, requestId, { ok: false, message: "Select a product first.", members: [] })
            return
          }
          void loadTeamMembers(token, pid)
            .then((members) => postOwnerOptions(el, requestId, { ok: true, members }))
            .catch((e) =>
              postOwnerOptions(el, requestId, {
                ok: false,
                message: e instanceof Error ? e.message : String(e),
                members: [],
              }),
            )
        },
        ownerFilter: (raw) => {
          const pid = positive(raw.productId) || ead.productId()
          if (pid <= 0) return
          const next = writeOwner(pid, {
            enabled: raw.enabled !== undefined ? raw.enabled === true : undefined,
            active: raw.active !== undefined ? raw.active === true : undefined,
            mode: raw.mode === "exclude" ? "exclude" : raw.mode === "include" ? "include" : undefined,
            memberEmail: typeof raw.memberEmail === "string" ? raw.memberEmail : undefined,
            memberLabel: typeof raw.memberLabel === "string" ? raw.memberLabel : undefined,
            memberEmails: Array.isArray(raw.memberEmails)
              ? raw.memberEmails.filter((x): x is string => typeof x === "string")
              : undefined,
            includeMe: raw.includeMe !== undefined ? raw.includeMe === true : undefined,
          } as Partial<ReturnType<typeof readOwner>>)
          postOwnerState(el, { ...next, summary: ownerSummary(next), productId: pid })
          ead.bumpMap()
        },
        pfmFilter: (raw) => {
          const type = String(raw.type || "")
          if (type === "clearPfmNodeFilter") {
            clearPfmFilter()
            postPfmFilterCleared(el)
            ead.bumpMap()
            return
          }
          const ids = Array.isArray(raw.filterIds)
            ? raw.filterIds.flatMap((id) => {
                const n = Number(id)
                return Number.isFinite(n) && n > 0 ? [n] : []
              })
            : Array.isArray(raw.selectionIds)
              ? raw.selectionIds.flatMap((id) => {
                  const n = Number(id)
                  return Number.isFinite(n) && n > 0 ? [n] : []
                })
              : readPfmFilter().ids
          const active = ids.length > 0 && (raw.active !== undefined ? raw.active === true : true)
          const filter = writePfmFilter(ids, active)
          postPfmFilterState(el, { active: filter.active, filterIds: filter.ids, productId: ead.productId() })
          postPfmFilterApplied(el, {
            active: filter.active,
            filterIds: filter.ids,
            selectionIds: filter.ids,
            linkedPaths: Array.isArray(raw.linkedPaths) ? raw.linkedPaths : [],
          })
          ead.bumpMap()
        },
      })
    }
    window.addEventListener("message", onMessage)
    onCleanup(() => window.removeEventListener("message", onMessage))
  })

  return (
    <Show when={isDesktop()}>
      <aside
        aria-label="EAD Pilot"
        aria-hidden={!panelOpen()}
        inert={!panelOpen()}
        class="relative min-w-0 h-full flex shrink-0 overflow-hidden bg-background-base"
        classList={{
          "pointer-events-none": !panelOpen(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.sizing.active(),
        }}
        style={{ width: panelWidth() }}
      >
        <div class="size-full flex flex-col border-r border-border-weaker-base">
          <div class="shrink-0 px-3 py-2 flex items-center justify-between border-b border-border-weaker-base gap-2">
            <span class="text-14-medium text-text-strong">EAD Pilot</span>
            <div class="flex items-center gap-1">
              <IconButton
                icon="link"
                variant="ghost"
                class="h-5 w-5"
                onClick={() => window.open(`${EAD_SERVER_URL}/plugin/ai-code`, "_blank", "noopener,noreferrer")}
                aria-label="Open EAD Pilot web"
              />
              <IconButton
                icon="close-small"
                variant="ghost"
                class="h-5 w-5"
                onClick={() => layout.pluginPanel.close(EAD_PILOT_ID)}
                aria-label={language.t("common.close")}
              />
            </div>
          </div>
          <div class="flex-1 min-h-0 overflow-hidden">
            <Show when={panelOpen()}>
              <iframe
                ref={setFrame}
                src={src()}
                class="size-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                allow="clipboard-read; clipboard-write"
                title="EAD Pilot"
                onLoad={() => push(frame())}
              />
            </Show>
          </div>
        </div>
        <Show when={panelOpen()}>
          <div onPointerDown={() => props.sizing.start()}>
            <ResizeHandle
              direction="horizontal"
              edge="end"
              size={width()}
              min={EAD_PILOT_MIN}
              max={EAD_PILOT_MAX}
              onResize={(w) => {
                props.sizing.touch()
                layout.pluginPanel.resize(EAD_PILOT_ID, w)
              }}
            />
          </div>
        </Show>
      </aside>
    </Show>
  )
}

export function openEadPilot(layout: ReturnType<typeof useLayout>, bump?: () => void) {
  if (bump) {
    openPilot(layout.pluginPanel, bump)
    return
  }
  layout.pluginPanel.open(EAD_PILOT_ID, EAD_PILOT_WIDTH)
}
