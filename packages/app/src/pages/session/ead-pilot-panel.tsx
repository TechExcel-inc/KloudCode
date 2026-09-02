import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useParams } from "@solidjs/router"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { showToast } from "@opencode-ai/ui/toast"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import type { Sizing } from "@/pages/session/helpers"
import { resizeEadPanel } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import { peekPilot, queuePilot, takePilot, watchPilot, type PilotAction } from "@/ead/actions"
import { loadContext, loadSubtreePaths, loadTeamMembers, reconcileJobs } from "@/ead/api"
import {
  applyPilotAction,
  buildPilotShellUrl,
  handlePluginMessage,
  hostClipboardCommand,
  isEadOrigin,
  openPilot,
  pingHost,
  postOwnerOptions,
  postOwnerState,
  postPfmFilterApplied,
  postPfmFilterCleared,
  postPfmFilterState,
  replyClipboard,
  replyWriteClipboard,
  replyTeamMembers,
  requestSessionSync,
  selectPfmSubSchema,
  setUiLanguage,
  syncAuth,
  syncAuthStatus,
  type SourceOpts,
} from "@/ead/bridge"
import { sendChat } from "@/ead/composer"
import { clearPfmFilter, ownerSummary, readOwner, readPfmFilter, writeOwner, writePfmFilter } from "@/ead/filters"
import { formatJobCounts, postJobResult, postJobsRefresh, postLifecycle, postTestsRefresh } from "@/ead/jobs"
import { useEad } from "@/ead/settings"
import { EAD_PILOT_ID, EAD_PILOT_MAX, EAD_PILOT_MIN, EAD_PILOT_WIDTH, eadServer } from "@/ead/urls"

const PING_MS = 30_000
const STALE_MS = 120_000
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
  const { view } = useSessionLayout()
  const language = useLanguage()
  const platform = usePlatform()
  const prompt = usePrompt()
  const sdk = useSDK()
  const params = useParams()
  const ead = useEad()
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const [frame, setFrame] = createSignal<HTMLIFrameElement>()
  const [beat, setBeat] = createSignal(0)
  const [reloadAt, setReloadAt] = createSignal(0)
  const [action, setAction] = createSignal<PilotAction | undefined>()
  const [alive, setAlive] = createSignal(false)

  const opened = layout.pluginPanel.opened(EAD_PILOT_ID)
  const width = layout.pluginPanel.width(EAD_PILOT_ID)
  const panelOpen = createMemo(() => isDesktop() && opened())
  const reviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened())
  const panelWidth = createMemo(() => (panelOpen() ? `${width()}px` : "0px"))

  createEffect(() => {
    if (panelOpen()) setAlive(true)
  })

  const linkedUnder = (paths: string[], folder: string) => {
    const root = folder.replace(/\/+$/, "")
    if (!root) return []
    return paths.filter((p) => p === root || p.startsWith(`${root}/`))
  }

  const selection = (): PilotAction | undefined => {
    if (ead.view() === "source" && ead.sourceId() > 0) {
      return {
        kind: "source",
        sourceId: ead.sourceId(),
        sourcePath: ead.sourcePath() || undefined,
        sourceName: ead.sourceName() || undefined,
        linkedPaths: linkedUnder(readPfmFilter(ead.productId()).paths, ead.sourcePath()),
      }
    }
    if (ead.nodeId() > 0) {
      return {
        kind: "pfm",
        nodeId: ead.nodeId(),
        nodeName: ead.nodeName() || undefined,
      }
    }
    return undefined
  }

  const src = createMemo(() => {
    return buildPilotShellUrl({
      productId: ead.productId(),
      productName: ead.productName(),
      subSchemaId: ead.subSchemaId() || undefined,
      language: ead.language(),
      mode: ead.pilotMode(),
      bust: ead.pilotBust(),
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
    openPilot(layout.pluginPanel)
    applyPilotAction(frame(), next, product())
  }

  createEffect(() => {
    const stop = watchPilot((next) => {
      if (!panelOpen()) return
      setAction(next)
      applyPilotAction(frame(), next, product())
      void takePilot()
    })
    onCleanup(stop)
  })

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
    const pending = takePilot() ?? action() ?? selection()
    if (pending) setAction(pending)
    applyPilotAction(el, pending ?? { kind: "dashboard" }, product())
    const pid = ead.productId()
    if (pid > 0) {
      const owner = readOwner(pid)
      postOwnerState(el, { ...owner, summary: ownerSummary(owner, ead.language()), productId: pid })
      const filter = readPfmFilter(pid)
      postPfmFilterState(el, {
        active: filter.active,
        filterIds: filter.ids,
        pfmNodeFilterIds: filter.active ? filter.ids : [],
        pfmNodeFilterSelectionIds: filter.ids,
        pfmNodeFilterActive: filter.active,
        pfmFilterLinkedPaths: filter.paths,
        productId: pid,
      })
      const sub = ead.subSchemaId()
      selectPfmSubSchema(el, { productId: pid, subSchemaId: sub > 0 ? sub : null })
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
    if (!alive()) return
    const queued = peekPilot()
    if (queued) setAction(queued)
    const el = frame()
    const token = ead.token()
    const lang = ead.language()
    void token
    void lang
    setBeat(Date.now())
    let stopped = false
    const run = () => {
      if (stopped) return
      push(el)
    }
    // Keep retries short: Pilot iframe dedupes identical updates; excess retries thrash on open.
    const timers = [0, 120, 500].map((ms) => window.setTimeout(run, ms))
    onCleanup(() => {
      stopped = true
      timers.forEach((t) => window.clearTimeout(t))
    })
  })

  createEffect(() => {
    if (!panelOpen()) return
    const queued = takePilot()
    if (!queued) return
    setAction(queued)
    applyPilotAction(frame(), queued, product())
  })

  createEffect(() => {
    if (!panelOpen()) return
    const pid = ead.productId()
    if (pid <= 0) return
    const sub = ead.subSchemaId()
    const el = frame()
    if (!el) return
    selectPfmSubSchema(el, { productId: pid, subSchemaId: sub > 0 ? sub : null })
  })

  createEffect(() => {
    if (!panelOpen()) return
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const el = frame()
      if (!el) return
      const root = document.getElementById("ead-pilot-panel")
      const active = document.activeElement
      if (!root?.contains(active) && active?.tagName !== "IFRAME") return
      if (mod && event.key === "c") {
        event.preventDefault()
        hostClipboardCommand(el, "copy")
        return
      }
      if (mod && event.key === "x") {
        event.preventDefault()
        hostClipboardCommand(el, "cut")
        return
      }
      if (mod && event.key === "v") {
        event.preventDefault()
        hostClipboardCommand(el, "paste")
        return
      }
      if (mod && event.key === "a") {
        event.preventDefault()
        hostClipboardCommand(el, "selectAll")
      }
    }
    window.addEventListener("keydown", onKey, true)
    onCleanup(() => window.removeEventListener("keydown", onKey, true))
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
        setNode: (id, name) => {
          ead.setView("pfm")
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
          ead.setView("source")
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
        queueCrawl: () => launch({ kind: "crawl" }),
        queueHelp: (tipId) => launch({ kind: "help", tipId }),
        syncAuth: () => {
          syncAuthStatus(el, ead.token())
          requestSessionSync(el)
        },
        noteHeartbeat: () => setBeat(Date.now()),
        bridgeReady: () => {
          setBeat(Date.now())
          push(el)
        },
        openExternal: (url, name) => {
          if (name) {
            const win = window.open(url, name)
            if (win) {
              try {
                win.focus()
              } catch {
                /* cross-origin */
              }
              return
            }
          }
          platform.openLink(url)
        },
        openWebApp: (opts) => {
          if (opts?.openEditProduct && opts.productId && opts.productId > 0) {
            const url = new URL("https://eadfm.com/plugin/ai-code")
            url.searchParams.set("productId", String(opts.productId))
            if (opts.productName) url.searchParams.set("productName", opts.productName)
            url.searchParams.set("openEditProduct", "1")
            platform.openLink(url.toString())
            return
          }
          platform.openLink(eadServer())
        },
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
        writeClipboard: (requestId, text) => {
          void navigator.clipboard
            .writeText(text)
            .then(() => replyWriteClipboard(el, requestId, { ok: true }))
            .catch((e) =>
              replyWriteClipboard(el, requestId, {
                ok: false,
                message: e instanceof Error ? e.message : "Clipboard write failed.",
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
          postOwnerState(el, { ...next, summary: ownerSummary(next, ead.language()), productId: pid })
          ead.bumpMap()
        },
        pfmFilter: (raw) => {
          const pid = positive(raw.productId) || ead.productId()
          const type = String(raw.type || "")
          if (type === "clearPfmNodeFilter") {
            clearPfmFilter(pid)
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
              : readPfmFilter(pid).ids
          const active =
            ids.length > 0 &&
            (raw.filterActive !== undefined
              ? raw.filterActive === true
              : raw.active !== undefined
                ? raw.active === true
                : true)
          const given = Array.isArray(raw.linkedPaths)
            ? raw.linkedPaths.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : []
          const filter = writePfmFilter(ids, active, given.length ? given : undefined, pid)
          const publish = (next: ReturnType<typeof writePfmFilter>, paths: string[]) => {
            postPfmFilterState(el, {
              active: next.active,
              filterIds: next.ids,
              pfmNodeFilterIds: next.active ? next.ids : [],
              pfmNodeFilterSelectionIds: next.ids,
              pfmNodeFilterActive: next.active,
              pfmFilterLinkedPaths: paths,
              productId: pid,
            })
            postPfmFilterApplied(el, {
              active: next.active,
              filterIds: next.ids,
              selectionIds: next.ids,
              linkedPaths: paths,
            })
            ead.bumpMap()
          }
          publish(filter, filter.paths)
          if (filter.active && !filter.paths.length && ead.token()) {
            void loadSubtreePaths(ead.token(), filter.ids).then((paths) => {
              publish(writePfmFilter(filter.ids, true, paths, pid), paths)
            })
          }
        },
      })
    }
    window.addEventListener("message", onMessage)
    onCleanup(() => window.removeEventListener("message", onMessage))
  })

  return (
    <Show when={isDesktop()}>
      <aside
        id="ead-pilot-panel"
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
                onClick={() => {
                  const url = buildPilotShellUrl({
                    productId: ead.productId(),
                    productName: ead.productName(),
                    subSchemaId: ead.subSchemaId() || undefined,
                    language: ead.language(),
                    mode: ead.pilotMode(),
                  })
                  window.open(url, "_blank", "noopener,noreferrer")
                }}
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
            <Show when={alive()}>
              <iframe
                ref={setFrame}
                src={src()}
                class="size-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
                allow="clipboard-read; clipboard-write"
                title="EAD Pilot"
                onLoad={() => push(frame())}
              />
            </Show>
          </div>
        </div>
        <Show when={panelOpen()}>
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={width()}
            min={EAD_PILOT_MIN}
            max={EAD_PILOT_MAX}
            onDragStart={() => props.sizing.begin()}
            onDragEnd={() => props.sizing.end()}
            onResize={(w) => {
              resizeEadPanel(layout, { id: EAD_PILOT_ID, width: w, review: reviewOpen() })
            }}
          />
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
