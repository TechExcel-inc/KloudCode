import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { showToast } from "@opencode-ai/ui/toast"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import type { Sizing } from "@/pages/session/helpers"
import { queuePilot } from "@/ead/actions"
import {
  createJob,
  loadActiveMap,
  loadContext,
  loadFilterNodeIds,
  loadJobsForNode,
  loadLinkedBundle,
  loadProducts,
  loadRawContext,
  loadSourceSchema,
  loadSubSchemas,
  login,
  me,
  resetPassword,
  selectSourcePath,
  sendCode,
  signup,
  verifyCode,
  type PfmNode,
  type Product,
  type SubSchema,
} from "@/ead/api"
import { openPilot } from "@/ead/bridge"
import { draftComposer, sendChat } from "@/ead/composer"
import { buildModal, formatModal, kindLabel, type ContextKind } from "@/ead/context-modal"
import { clearEadMcp, ensureEadMcp } from "@/ead/ensure-mcp"
import { readPfmFilter } from "@/ead/filters"
import { useEad } from "@/ead/settings"
import {
  buildTree,
  filterByCount,
  filterByIds,
  filterDisplay,
  filterPfm,
  filterSource,
  parseRows,
  type SourceNode,
} from "@/ead/source-tree"
import { EAD_MAP_ID, EAD_MAP_MAX, EAD_MAP_MIN, EAD_MAP_WIDTH, EAD_PILOT_ID, EAD_SERVER_URL } from "@/ead/urls"

function Tree(props: {
  nodes: PfmNode[]
  selected: number
  onSelect: (node: PfmNode) => void
  depth?: number
}) {
  const depth = () => props.depth ?? 0
  return (
    <For each={props.nodes}>
      {(node) => {
        const [open, setOpen] = createSignal(depth() < 2)
        const kids = () => node.children.length > 0
        return (
          <div>
            <button
              type="button"
              class="w-full flex items-center gap-1 px-2 py-1 text-left text-12-regular rounded-md hover:bg-surface-base-hover"
              classList={{
                "bg-surface-base-active text-text-strong": props.selected === node.nodeId,
                "text-text-base": props.selected !== node.nodeId,
              }}
              style={{ "padding-left": `${8 + depth() * 12}px` }}
              onClick={() => props.onSelect(node)}
            >
              <Show when={kids()} fallback={<span class="w-3 shrink-0" />}>
                <span
                  class="w-3 shrink-0 text-text-weak"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen((v) => !v)
                  }}
                >
                  {open() ? "▾" : "▸"}
                </span>
              </Show>
              <span class="truncate">{node.name}</span>
            </button>
            <Show when={kids() && open()}>
              <Tree nodes={node.children} selected={props.selected} onSelect={props.onSelect} depth={depth() + 1} />
            </Show>
          </div>
        )
      }}
    </For>
  )
}

function SourceTree(props: {
  nodes: SourceNode[]
  selected: number
  onSelect: (node: SourceNode) => void
  depth?: number
  counts?: Record<string, number>
  expanded?: string[]
  onExpand?: (path: string, open: boolean) => void
}) {
  const depth = () => props.depth ?? 0
  return (
    <For each={props.nodes}>
      {(node) => {
        const controlled = () => Array.isArray(props.expanded)
        const [local, setLocal] = createSignal(depth() < 1)
        const open = () => (controlled() ? props.expanded!.includes(node.nodePath) : local())
        const kids = () => node.children.length > 0
        const count = () => Number(props.counts?.[String(node.nodeId)] || 0)
        const toggle = (e: MouseEvent) => {
          e.stopPropagation()
          const next = !open()
          if (controlled() && props.onExpand) {
            props.onExpand(node.nodePath, next)
            return
          }
          setLocal(next)
        }
        return (
          <div>
            <button
              type="button"
              class="w-full flex items-center gap-1 px-2 py-1 text-left text-12-regular rounded-md hover:bg-surface-base-hover"
              classList={{
                "bg-surface-base-active text-text-strong": props.selected === node.nodeId,
                "text-text-base": props.selected !== node.nodeId,
              }}
              style={{ "padding-left": `${8 + depth() * 12}px` }}
              onClick={() => props.onSelect(node)}
              title={node.nodePath}
            >
              <Show when={kids()} fallback={<span class="w-3 shrink-0" />}>
                <span class="w-3 shrink-0 text-text-weak" onClick={toggle}>
                  {open() ? "▾" : "▸"}
                </span>
              </Show>
              <span class="truncate">{node.nodeName}</span>
              <Show when={count() > 0}>
                <span class="shrink-0 text-11-regular text-text-weak">· {count()}</span>
              </Show>
            </button>
            <Show when={kids() && open()}>
              <SourceTree
                nodes={node.children}
                selected={props.selected}
                onSelect={props.onSelect}
                depth={depth() + 1}
                counts={props.counts}
                expanded={props.expanded}
                onExpand={props.onExpand}
              />
            </Show>
          </div>
        )
      }}
    </For>
  )
}

type AuthTab = "signin" | "signup" | "reset"

const KINDS: ContextKind[] = ["prompt", "jobs", "skills", "api", "source"]

export function EadMapPanel(props: { sizing: Sizing }) {
  const layout = useLayout()
  const language = useLanguage()
  const platform = usePlatform()
  const prompt = usePrompt()
  const ead = useEad()
  const sdk = useSDK()
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const http = () => platform.fetch ?? globalThis.fetch

  const opened = layout.pluginPanel.opened(EAD_MAP_ID)
  const width = layout.pluginPanel.width(EAD_MAP_ID)
  const panelOpen = createMemo(() => isDesktop() && opened())
  const panelWidth = createMemo(() => (panelOpen() ? `${width()}px` : "0px"))

  const [products, setProducts] = createSignal<Product[]>([])
  const [root, setRoot] = createSignal<PfmNode | undefined>()
  const [source, setSource] = createSignal<SourceNode[]>([])
  const [schemas, setSchemas] = createSignal<SubSchema[]>([])
  const [jobIds, setJobIds] = createSignal<Set<number> | undefined>()
  const [eadCounts, setEadCounts] = createSignal<Record<string, number>>({})
  const [jobCounts, setJobCounts] = createSignal<Record<string, number>>({})
  const [testCounts, setTestCounts] = createSignal<Record<string, number>>({})
  const [pendingPaths, setPendingPaths] = createSignal<Record<string, boolean>>({})
  const [query, setQuery] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal("")
  const [user, setUser] = createSignal("")
  const [tab, setTab] = createSignal<AuthTab>("signin")
  const [id, setId] = createSignal("")
  const [pass, setPass] = createSignal("")
  const [target, setTarget] = createSignal("")
  const [code, setCode] = createSignal("")
  const [username, setUsername] = createSignal("")
  const [signupToken, setSignupToken] = createSignal("")
  const [newPass, setNewPass] = createSignal("")
  const [kind, setKind] = createSignal<ContextKind>("prompt")
  const [title, setTitle] = createSignal("")

  const badgeCounts = createMemo(() => {
    const mode = ead.badge()
    if (mode === "jobs") return jobCounts()
    if (mode === "tests") return testCounts()
    if (mode === "none") return {} as Record<string, number>
    return eadCounts()
  })

  const pfmVisible = createMemo(() => {
    const node = root()
    if (!node) return [] as PfmNode[]
    let nodes = [node]
    const jobs = jobIds()
    if (ead.jobsOnly() && jobs) nodes = filterByIds(nodes, jobs)
    const filter = readPfmFilter()
    if (filter.active && filter.ids.length) nodes = filterByIds(nodes, new Set(filter.ids))
    return filterPfm(nodes, query())
  })

  const sourceVisible = createMemo(() => {
    const nodes = ead.eadsOnly()
      ? filterByCount(source(), eadCounts(), pendingPaths(), true)
      : source()
    return filterSource(nodes, query())
  })

  const sourceOpts = () => ({
    productId: ead.productId() || undefined,
    productName: ead.productName() || undefined,
    sourceId: ead.sourceId() || undefined,
    sourcePath: ead.sourcePath() || undefined,
    sourceName: ead.sourceName() || undefined,
  })

  const launch = (action: Parameters<typeof queuePilot>[0]) => {
    queuePilot(action)
    openPilot(layout.pluginPanel, () => ead.bumpPilot())
  }

  const clearCounts = () => {
    setEadCounts({})
    setJobCounts({})
    setTestCounts({})
    setPendingPaths({})
  }

  const loadSource = async (sync = false) => {
    const token = ead.token()
    const pid = ead.productId()
    if (!token || pid <= 0) {
      setSource([])
      clearCounts()
      return
    }
    const schema = await loadSourceSchema(token, pid, http())
    if (!schema) {
      setSource([])
      clearCounts()
      ead.setSchema(0, "")
      return
    }
    ead.setSchema(schema.schemaId, schema.name)
    let rows: Array<Record<string, unknown>> = []
    let used = schema.schemaId
    let eads: Record<string, number> = {}
    let jobs: Record<string, number> = {}
    let tests: Record<string, number> = {}
    let pending: Record<string, boolean> = {}
    let defaults: string[] = []
    for (const sid of schema.candidates) {
      const bundle = await loadLinkedBundle(token, pid, sid, http(), sync)
      if (bundle.nodes.length) {
        used = sid
        rows = bundle.nodes
        eads = bundle.eadCountByNodeId
        jobs = bundle.openJobCountByNodeId
        tests = bundle.openTestCaseCountByNodeId
        pending = bundle.pendingEadByNodePath
        defaults = bundle.expandByDefaultPaths
        break
      }
    }
    if (!rows.length && !sync) {
      for (const sid of schema.candidates) {
        const bundle = await loadLinkedBundle(token, pid, sid, http(), true)
        if (bundle.nodes.length) {
          used = sid
          rows = bundle.nodes
          eads = bundle.eadCountByNodeId
          jobs = bundle.openJobCountByNodeId
          tests = bundle.openTestCaseCountByNodeId
          pending = bundle.pendingEadByNodePath
          defaults = bundle.expandByDefaultPaths
          break
        }
      }
    }
    if (used !== schema.schemaId) ead.setSchema(used, schema.name)
    setEadCounts(eads)
    setJobCounts(jobs)
    setTestCounts(tests)
    setPendingPaths(pending)
    const tree = buildTree(filterDisplay(parseRows(rows)))
    setSource(tree)
    if (!ead.expanded(used).length) {
      const seed = defaults.length ? defaults : tree.map((n) => n.nodePath)
      if (seed.length) ead.setExpanded(used, seed)
    }
  }

  const refresh = async () => {
    const token = ead.token()
    if (!token) {
      setProducts([])
      setRoot(undefined)
      setSource([])
      setSchemas([])
      setJobIds(undefined)
      clearCounts()
      setUser("")
      return
    }
    setBusy(true)
    setErr("")
    try {
      const fetcher = http()
      const profile = await me(token, fetcher)
      setUser(String(profile?.name || profile?.userName || profile?.email || "signed in"))
      const list = await loadProducts(token, fetcher)
      setProducts(list)
      const pid = ead.productId()
      const selected = pid > 0 ? list.find((p) => p.productId === pid) : undefined
      if (!selected) {
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        clearCounts()
        return
      }
      if (selected.name && selected.name !== ead.productName()) {
        ead.setProduct(selected.productId, selected.name)
      }
      const sub = ead.subSchemaId()
      const map = await loadActiveMap(token, selected.productId, fetcher, sub > 0 ? sub : undefined)
      ead.setMapId(map.mapId)
      setRoot(map.root)
      if (map.supportSubSchemas && map.mapId > 0) {
        setSchemas(await loadSubSchemas(token, map.mapId, fetcher))
      } else {
        setSchemas([])
      }
      if (ead.jobsOnly() && map.mapId > 0) {
        const ids = await loadFilterNodeIds(token, map.mapId, fetcher)
        setJobIds(new Set(ids))
      } else {
        setJobIds(undefined)
      }
      if (ead.view() === "source") await loadSource()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === "AUTH_EXPIRED") {
        ead.signOut()
        setProducts([])
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        clearCounts()
        setUser("")
        setErr("Session expired — please sign in again.")
        return
      }
      setErr(msg)
      setRoot(undefined)
      setSource([])
      setSchemas([])
      setJobIds(undefined)
      clearCounts()
    } finally {
      setBusy(false)
    }
  }

  createEffect(() => {
    if (!panelOpen()) return
    void ead.mapTick()
    void refresh()
  })

  const applyContext = async (nodeId: number, nodeName: string, type: "pfm" | "source") => {
    if (layout.pluginPanel.opened(EAD_PILOT_ID)()) ead.bumpPilot()
    const token = ead.token()
    if (!token) return
    setBusy(true)
    setErr("")
    try {
      const ctx = await loadContext(token, nodeId, nodeName, http(), type)
      ead.setContext({
        nodeName: ctx.nodeName,
        eadScript: ctx.eadScript,
        aiPrompt: ctx.aiPrompt,
        markdown: ctx.markdown,
      })
    } catch (e) {
      ead.clearContext()
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const selectNode = (node: PfmNode) => {
    ead.setNode(node.nodeId, node.name)
    void applyContext(node.nodeId, node.name, "pfm")
  }

  const selectSource = (node: SourceNode) => {
    ead.setSource(node.nodeId, node.nodeName, node.nodePath)
    const token = ead.token()
    const sid = ead.schemaId()
    if (token && sid > 0) void selectSourcePath(token, sid, node.nodePath, http())
    if (layout.pluginPanel.opened(EAD_PILOT_ID)()) {
      queuePilot({
        kind: "source",
        sourceId: node.nodeId,
        sourcePath: node.nodePath,
        sourceName: node.nodeName,
      })
      ead.bumpPilot()
    }
    void applyContext(node.nodeId, node.nodeName, "source")
  }

  const onExpand = (path: string, open: boolean) => {
    const sid = ead.schemaId()
    if (sid <= 0) return
    const prev = ead.expanded(sid)
    const next = open ? [...new Set([...prev, path])] : prev.filter((p) => p !== path)
    ead.setExpanded(sid, next)
  }

  const afterAuth = async (token: string) => {
    ead.setToken(token)
    setPass("")
    setNewPass("")
    setCode("")
    setSignupToken("")
    await refresh()
    const entry = await ensureEadMcp({
      client: sdk.client,
      token,
      entry: ead.mcpEntry(),
      worktree: sdk.directory,
    }).catch((e) => {
      showToast({
        title: "MCP",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      })
      return ""
    })
    if (entry) ead.setMcpEntry(entry)
  }

  const onLogin = async () => {
    setBusy(true)
    setErr("")
    try {
      await afterAuth(await login(id(), pass(), http()))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onSendCode = async (intent: "signup" | "reset") => {
    setBusy(true)
    setErr("")
    try {
      const result = await sendCode(target(), intent, http())
      showToast({ title: "EAD", description: result.message, variant: "success" })
      if (result.code) setCode(result.code)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async () => {
    setBusy(true)
    setErr("")
    try {
      setSignupToken(await verifyCode(target(), code(), http()))
      showToast({ title: "EAD", description: "Code verified.", variant: "success" })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onSignup = async () => {
    setBusy(true)
    setErr("")
    try {
      await afterAuth(
        await signup(
          {
            target: target(),
            username: username(),
            password: pass(),
            signupToken: signupToken(),
          },
          http(),
        ),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onReset = async () => {
    setBusy(true)
    setErr("")
    try {
      const message = await resetPassword(
        {
          target: target(),
          code: code(),
          password: newPass(),
        },
        http(),
      )
      showToast({ title: "EAD", description: message, variant: "success" })
      setTab("signin")
      setId(target())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onSignOut = () => {
    void clearEadMcp({
      client: sdk.client,
      entry: ead.mcpEntry(),
      worktree: sdk.directory,
    }).catch(() => undefined)
    ead.signOut()
    ead.bumpPilot()
    setProducts([])
    setRoot(undefined)
    setSource([])
    setSchemas([])
    setJobIds(undefined)
    clearCounts()
    setUser("")
    setQuery("")
    setErr("")
    setTitle("")
  }

  const switchView = async (view: "pfm" | "source") => {
    ead.setView(view)
    setQuery("")
    if (view !== "source") return
    setBusy(true)
    setErr("")
    try {
      await loadSource()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setSource([])
      clearCounts()
    } finally {
      setBusy(false)
    }
  }

  const copyContext = () => {
    const markdown = ead.contextMarkdown().trim()
    const name = (ead.sourceId() > 0 ? ead.sourceName() : ead.nodeName()).trim()
    const text = markdown || (name ? `Active EAD context: ${name}` : "")
    if (!text) {
      showToast({ title: "EAD", description: "No active context to copy.", variant: "error" })
      return
    }
    draftComposer((next) => prompt.set(next), text)
    showToast({ title: "EAD", description: "Context drafted in composer.", variant: "success" })
  }

  const activeId = () => (ead.sourceId() > 0 ? ead.sourceId() : ead.nodeId())
  const activeName = () => (ead.sourceId() > 0 ? ead.sourceName() : ead.nodeName())
  const activeKind = () => (ead.sourceId() > 0 ? ("source" as const) : ("pfm" as const))

  const injectContext = async () => {
    const token = ead.token()
    const nodeId = activeId()
    const name = activeName()
    if (!token || nodeId <= 0) return
    setBusy(true)
    setErr("")
    try {
      const raw = await loadRawContext(token, nodeId, http(), activeKind())
      const jobs =
        kind() === "jobs"
          ? ((await loadJobsForNode(token, nodeId, http())) as Array<{
              jobId?: number
              title?: string
              description?: string
              jobStatus?: number
            }>)
          : []
      const text = formatModal(buildModal(kind(), nodeId, name, raw, jobs))
      await sendChat({ text, set: (next) => prompt.set(next) })
      showToast({ title: "EAD", description: `${kindLabel(kind())} drafted in composer.`, variant: "success" })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onCreateTask = async () => {
    const token = ead.token()
    const nodeId = activeId()
    const name = title().trim()
    if (!token || nodeId <= 0 || !name) {
      showToast({ title: "EAD", description: "Task title required.", variant: "error" })
      return
    }
    setBusy(true)
    setErr("")
    try {
      await createJob(token, { pfmNodeId: nodeId, title: name }, http())
      setTitle("")
      setKind("jobs")
      const raw = await loadRawContext(token, nodeId, http(), activeKind())
      const jobs = (await loadJobsForNode(token, nodeId, http())) as Array<{
        jobId?: number
        title?: string
        description?: string
        jobStatus?: number
      }>
      const text = formatModal(buildModal("jobs", nodeId, activeName(), raw, jobs))
      await sendChat({ text, set: (next) => prompt.set(next) })
      showToast({ title: "EAD", description: "Task created and jobs injected.", variant: "success" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      showToast({ title: "EAD", description: msg, variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  const field = "w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"

  return (
    <Show when={isDesktop()}>
      <aside
        aria-label="EAD Map"
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
            <span class="text-14-medium text-text-strong truncate">EAD Map</span>
            <div class="flex items-center gap-1">
              <select
                class="h-6 text-11-regular rounded border border-border-weaker-base bg-background-base px-1"
                value={ead.language()}
                onChange={(e) => {
                  ead.setLanguage(e.currentTarget.value === "en" ? "en" : "zh")
                  ead.bumpPilot()
                }}
                aria-label="Language"
              >
                <option value="zh">中文</option>
                <option value="en">EN</option>
              </select>
              <IconButton icon="expand" variant="ghost" class="h-5 w-5" onClick={() => void refresh()} aria-label="Refresh" />
              <IconButton
                icon="close-small"
                variant="ghost"
                class="h-5 w-5"
                onClick={() => layout.pluginPanel.close(EAD_MAP_ID)}
                aria-label={language.t("common.close")}
              />
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
            <Show
              when={ead.token()}
              fallback={
                <div class="flex flex-col gap-2">
                  <div class="flex gap-1">
                    <Button size="small" variant={tab() === "signin" ? "primary" : "ghost"} onClick={() => setTab("signin")}>
                      Sign in
                    </Button>
                    <Button size="small" variant={tab() === "signup" ? "primary" : "ghost"} onClick={() => setTab("signup")}>
                      Sign up
                    </Button>
                    <Button size="small" variant={tab() === "reset" ? "primary" : "ghost"} onClick={() => setTab("reset")}>
                      Reset
                    </Button>
                  </div>

                  <Show when={tab() === "signin"}>
                    <p class="text-12-regular text-text-weak">Sign in to EAD PFM (eadfm.com)</p>
                    <input class={field} placeholder="Email / phone / login" value={id()} onInput={(e) => setId(e.currentTarget.value)} />
                    <input
                      type="password"
                      class={field}
                      placeholder="Password"
                      value={pass()}
                      onInput={(e) => setPass(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void onLogin()
                      }}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onLogin()}>
                      Sign in
                    </Button>
                  </Show>

                  <Show when={tab() === "signup"}>
                    <p class="text-12-regular text-text-weak">Create an EAD account</p>
                    <input class={field} placeholder="Email or phone" value={target()} onInput={(e) => setTarget(e.currentTarget.value)} />
                    <div class="flex gap-1">
                      <Button size="small" variant="secondary" disabled={busy()} onClick={() => void onSendCode("signup")}>
                        Send code
                      </Button>
                      <Button size="small" variant="ghost" disabled={busy()} onClick={() => void onVerify()}>
                        Verify
                      </Button>
                    </div>
                    <input class={field} placeholder="6-digit code" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
                    <input class={field} placeholder="Username" value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
                    <input
                      type="password"
                      class={field}
                      placeholder="Password"
                      value={pass()}
                      onInput={(e) => setPass(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy() || !signupToken()} onClick={() => void onSignup()}>
                      Create account
                    </Button>
                  </Show>

                  <Show when={tab() === "reset"}>
                    <p class="text-12-regular text-text-weak">Reset password</p>
                    <input class={field} placeholder="Email or phone" value={target()} onInput={(e) => setTarget(e.currentTarget.value)} />
                    <Button size="small" variant="secondary" disabled={busy()} onClick={() => void onSendCode("reset")}>
                      Send code
                    </Button>
                    <input class={field} placeholder="6-digit code" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
                    <input
                      type="password"
                      class={field}
                      placeholder="New password"
                      value={newPass()}
                      onInput={(e) => setNewPass(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onReset()}>
                      Reset password
                    </Button>
                  </Show>
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-12-regular text-text-weak truncate">{user() || "Signed in"}</span>
                  <div class="flex items-center gap-1 shrink-0">
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={() => window.open(`${EAD_SERVER_URL}/welcome/profile`, "_blank")}
                    >
                      My Profile
                    </Button>
                    <Button size="small" variant="ghost" onClick={onSignOut}>
                      Sign out
                    </Button>
                  </div>
                </div>

                <label class="text-12-medium text-text-weak">Product</label>
                <div class="flex gap-1">
                  <select
                    class={`${field} flex-1`}
                    ref={(el) => {
                      createEffect(() => {
                        const id = ead.productId() > 0 ? String(ead.productId()) : ""
                        void products().length
                        if (el.value !== id) el.value = id
                      })
                    }}
                    onChange={(e) => {
                      const next = Number(e.currentTarget.value)
                      const product = products().find((p) => p.productId === next)
                      if (!product) return
                      ead.setProduct(product.productId, product.name)
                      void refresh()
                    }}
                  >
                    <option value="">Select product…</option>
                    <For each={products()}>{(p) => <option value={String(p.productId)}>{p.name}</option>}</For>
                  </select>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={ead.productId() <= 0}
                    onClick={() => launch({ kind: "editProduct" })}
                    title="Edit product"
                  >
                    ✎
                  </Button>
                </div>

                <Show when={schemas().length > 0}>
                  <label class="text-12-medium text-text-weak">Sub-schema</label>
                  <select
                    class={field}
                    value={ead.subSchemaId() > 0 ? String(ead.subSchemaId()) : ""}
                    onChange={(e) => {
                      ead.setSubSchema(Number(e.currentTarget.value) || 0)
                      void refresh()
                    }}
                  >
                    <option value="">Base map</option>
                    <For each={schemas()}>{(s) => <option value={String(s.id)}>{s.name}</option>}</For>
                  </select>
                </Show>

                <Show when={ead.productId() > 0}>
                  <div class="text-11-regular text-text-weak flex flex-col gap-0.5">
                    <span>
                      Product ID: {ead.productId()}
                      <Show when={ead.mapId() > 0}> · Map ID: {ead.mapId()}</Show>
                    </span>
                    <Show when={ead.schemaId() > 0}>
                      <span class="truncate">
                        Schema: {ead.schemaName() || ead.schemaId()} ({ead.schemaId()})
                      </span>
                    </Show>
                  </div>
                </Show>

                <div class="flex gap-1">
                  <Button size="small" variant={ead.view() === "pfm" ? "primary" : "ghost"} onClick={() => void switchView("pfm")}>
                    PFM
                  </Button>
                  <Button size="small" variant={ead.view() === "source" ? "primary" : "ghost"} onClick={() => void switchView("source")}>
                    Source
                  </Button>
                </div>

                <Show when={ead.view() === "pfm"}>
                  <label class="flex items-center gap-2 text-12-regular text-text-weak">
                    <input
                      type="checkbox"
                      checked={ead.jobsOnly()}
                      onChange={(e) => {
                        ead.setJobsOnly(e.currentTarget.checked)
                        void refresh()
                      }}
                    />
                    Jobs only
                  </label>
                </Show>

                <Show when={ead.view() === "source"}>
                  <div class="flex flex-col gap-1">
                    <label class="flex items-center gap-2 text-12-regular text-text-weak">
                      <input
                        type="checkbox"
                        checked={ead.eadsOnly()}
                        onChange={(e) => ead.setEadsOnly(e.currentTarget.checked)}
                      />
                      EADs only
                    </label>
                    <label class="text-12-medium text-text-weak">Badge</label>
                    <select
                      class={field}
                      value={ead.badge()}
                      onChange={(e) => {
                        const v = e.currentTarget.value
                        if (v === "ead" || v === "jobs" || v === "tests" || v === "none") ead.setBadge(v)
                      }}
                    >
                      <option value="ead">EAD</option>
                      <option value="jobs">Jobs</option>
                      <option value="tests">Tests</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </Show>

                <input
                  class={field}
                  placeholder={ead.view() === "source" ? "Search source…" : "Search PFM…"}
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />

                <Show when={busy()}>
                  <span class="text-12-regular text-text-weak">Loading…</span>
                </Show>

                <Show when={ead.view() === "pfm"}>
                  <Show when={pfmVisible().length}>
                    <div class="flex flex-col gap-1 border border-border-weaker-base rounded-md py-1 max-h-[42vh] overflow-y-auto">
                      <Tree nodes={pfmVisible()} selected={ead.nodeId()} onSelect={selectNode} />
                    </div>
                  </Show>
                  <Show when={!busy() && ead.productId() > 0 && !root()}>
                    <span class="text-12-regular text-text-weak">No active PFM map for this product.</span>
                  </Show>
                  <Show when={!busy() && root() && pfmVisible().length === 0 && (query().trim() || ead.jobsOnly())}>
                    <span class="text-12-regular text-text-weak">No matching nodes.</span>
                  </Show>
                </Show>

                <Show when={ead.view() === "source"}>
                  <Show when={sourceVisible().length}>
                    <div class="flex flex-col gap-1 border border-border-weaker-base rounded-md py-1 max-h-[42vh] overflow-y-auto">
                      <SourceTree
                        nodes={sourceVisible()}
                        selected={ead.sourceId()}
                        onSelect={selectSource}
                        counts={badgeCounts()}
                        expanded={ead.expanded(ead.schemaId())}
                        onExpand={onExpand}
                      />
                    </div>
                  </Show>
                  <Show when={!busy() && ead.productId() > 0 && source().length === 0}>
                    <div class="flex flex-col gap-2">
                      <span class="text-12-regular text-text-weak">No linked source tree for this product.</span>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={busy()}
                        onClick={() => {
                          setBusy(true)
                          setErr("")
                          void loadSource(true)
                            .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
                            .finally(() => setBusy(false))
                        }}
                      >
                        Sync / open source links
                      </Button>
                    </div>
                  </Show>
                  <Show when={!busy() && source().length > 0 && sourceVisible().length === 0 && (query().trim() || ead.eadsOnly())}>
                    <span class="text-12-regular text-text-weak">No matching source nodes.</span>
                  </Show>
                </Show>

                <Show when={ead.nodeId() > 0 || ead.sourceId() > 0}>
                  <div class="flex flex-col gap-1">
                    <span class="text-11-regular text-text-weak truncate">
                      Selected: {ead.sourceId() > 0 ? ead.sourceName() : ead.nodeName()}
                      <Show when={ead.sourceId() > 0}> (source)</Show>
                    </span>
                    <Show when={ead.contextMarkdown()}>
                      <span class="text-11-regular text-text-weak">Context synced → Chat system prompt</span>
                    </Show>
                    <label class="text-12-medium text-text-weak">Context</label>
                    <select
                      class={field}
                      value={kind()}
                      onChange={(e) => {
                        const v = e.currentTarget.value
                        if (v === "prompt" || v === "jobs" || v === "skills" || v === "api" || v === "source") setKind(v)
                      }}
                    >
                      <For each={KINDS}>{(k) => <option value={k}>{kindLabel(k)}</option>}</For>
                    </select>
                    <Button size="small" variant="secondary" disabled={busy()} onClick={() => void injectContext()}>
                      Inject to composer
                    </Button>
                    <div class="flex gap-1">
                      <input
                        class={`${field} flex-1`}
                        placeholder="New task title"
                        value={title()}
                        onInput={(e) => setTitle(e.currentTarget.value)}
                      />
                      <Button size="small" variant="secondary" disabled={busy() || !title().trim()} onClick={() => void onCreateTask()}>
                        Create task
                      </Button>
                    </div>
                  </div>
                </Show>

                <div class="flex flex-col gap-1">
                  <Button size="small" variant="primary" onClick={() => launch({ kind: "dashboard" })}>
                    AI Pilot / AI 领航
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={ead.productId() <= 0}
                    onClick={() => launch({ kind: "setup" })}
                  >
                    Setup EAD Map
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={ead.productId() <= 0}
                    onClick={() => launch({ kind: "mindmap" })}
                  >
                    PFM Mindmap filter
                  </Button>
                  <Show when={ead.view() === "source"}>
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={ead.productId() <= 0}
                      onClick={() => launch({ kind: "setupSource" })}
                    >
                      Setup Source Tree
                    </Button>
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={ead.productId() <= 0}
                      onClick={() => launch({ kind: "find", ...sourceOpts() })}
                    >
                      AI Find / Create
                    </Button>
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={ead.sourceId() <= 0}
                      onClick={() => launch({ kind: "create", ...sourceOpts() })}
                    >
                      Analyze & Create EAD
                    </Button>
                  </Show>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={!ead.contextMarkdown() && !ead.nodeName() && !ead.sourceName()}
                    onClick={copyContext}
                  >
                    Copy context to composer
                  </Button>
                </div>
              </div>
            </Show>

            <Show when={err()}>
              <p class="text-12-regular text-text-weak break-words">{err()}</p>
            </Show>
          </div>
        </div>

        <Show when={panelOpen()}>
          <div onPointerDown={() => props.sizing.start()}>
            <ResizeHandle
              direction="horizontal"
              edge="end"
              size={width()}
              min={EAD_MAP_MIN}
              max={EAD_MAP_MAX}
              onResize={(w) => {
                props.sizing.touch()
                layout.pluginPanel.resize(EAD_MAP_ID, w)
              }}
            />
          </div>
        </Show>
      </aside>
    </Show>
  )
}

export function openEadMap(layout: ReturnType<typeof useLayout>) {
  layout.pluginPanel.open(EAD_MAP_ID, EAD_MAP_WIDTH)
}
