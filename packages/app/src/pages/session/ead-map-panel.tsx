import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
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
  loadActiveMap,
  loadContext,
  loadJobsForNode,
  loadLinkedBundle,
  loadOpenFilterNodeIds,
  loadPfmEadCounts,
  loadPfmJobCounts,
  loadPfmTestCounts,
  loadProducts,
  loadRawContext,
  loadSourceSchema,
  loadSubSchemas,
  loadTeamMembers,
  login,
  me,
  resetPassword,
  selectSourcePath,
  sendCode,
  signup,
  suggestProduct,
  verifyCode,
  type PfmNode,
  type Product,
  type SubSchema,
  type TeamMember,
} from "@/ead/api"
import { openPilot } from "@/ead/bridge"
import { sendChat } from "@/ead/composer"
import { buildModal, formatModal, kindLabel, type ContextKind } from "@/ead/context-modal"
import { clearEadMcp, ensureEadMcp } from "@/ead/ensure-mcp"
import { ownerSummary, readOwner, readPfmFilter, writeOwner, writePfmFilter } from "@/ead/filters"
import { useEad } from "@/ead/settings"
import {
  buildTree,
  collectIds,
  filterByCount,
  filterByIds,
  filterDisplay,
  filterPfm,
  filterSource,
  parseRows,
  pathIds,
  rollupCounts,
  type SourceNode,
} from "@/ead/source-tree"
import { EAD_MAP_ID, EAD_MAP_MAX, EAD_MAP_MIN, EAD_MAP_WIDTH, EAD_PILOT_ID, EAD_SERVER_URL } from "@/ead/urls"

type AuthTab =
  | "signin"
  | "signup-start"
  | "signup-verify"
  | "signup-create"
  | "forgot"
  | "forgot-reset"
  | "forgot-success"
type Hint = { productId: number; name: string }
type Banner = { kind: "loading" | "ok" | "error"; text: string }
type Menu =
  | ""
  | "user"
  | "lang"
  | "product"
  | "schema"
  | "setup"
  | "job"
  | "run"
  | "view"
  | "scope"
  | "owner"
  | "chip"

const KINDS: ContextKind[] = ["jobs", "prompt", "skills", "api", "source"]

const field = "w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"
const drop =
  "absolute z-20 mt-1 min-w-[11rem] max-w-[18rem] rounded-md border border-border-weak-base bg-background-base shadow-md py-1 text-12-regular"
const item =
  "w-full px-2.5 py-1.5 text-left text-12-regular hover:bg-surface-base-hover text-text-base disabled:opacity-40"
const itemActive = "bg-surface-base-active text-text-strong"

function Tree(props: {
  nodes: PfmNode[]
  selected: number
  onSelect: (node: PfmNode) => void
  depth?: number
  badge?: "ead" | "jobs" | "tests" | "none"
  counts?: Record<string, number>
  work?: number
  force?: number[]
  chip?: number
  onChip: (id: number) => void
  onInject: (kind: ContextKind, node: PfmNode) => void
}) {
  const depth = () => props.depth ?? 0
  return (
    <For each={props.nodes}>
      {(node) => {
        const [open, setOpen] = createSignal(depth() < 2)
        const kids = () => node.children.length > 0
        const on = () => props.selected === node.nodeId
        const work = () => !!props.work && props.work === node.nodeId && !on()
        const shown = () => !!props.force?.includes(node.nodeId) || open()
        const count = () => Number(props.counts?.[String(node.nodeId)] || 0)
        const label = () => {
          const n = count()
          if (n <= 0 || !props.badge || props.badge === "none") return ""
          if (props.badge === "ead") return `EAD ${n}`
          if (props.badge === "jobs") return `Jobs ${n}`
          return `Tests ${n}`
        }
        return (
          <div>
            <div
              class="w-full flex items-center gap-1 px-1.5 py-0.5 text-left text-12-regular rounded-md hover:bg-surface-base-hover group"
              classList={{
                "bg-surface-base-active text-text-strong": on(),
                "text-sky-400": work(),
                "text-text-base": !on() && !work(),
              }}
              style={{ "padding-left": `${6 + depth() * 12}px` }}
            >
              <Show when={kids()} fallback={<span class="w-3 shrink-0" />}>
                <button
                  type="button"
                  class="w-3 shrink-0 text-text-weak"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen((v) => !v)
                  }}
                >
                  {shown() ? "▾" : "▸"}
                </button>
              </Show>
              <Show when={work()}>
                <span class="w-1.5 h-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden="true" />
              </Show>
              <button type="button" class="min-w-0 flex-1 truncate text-left" onClick={() => props.onSelect(node)}>
                {node.name}
              </button>
              <Show when={label()}>
                <span class="shrink-0 px-1 rounded text-11-regular bg-surface-base-active text-text-weak">{label()}</span>
              </Show>
              <Show when={on()}>
                <div class="relative shrink-0">
                  <button
                    type="button"
                    class="px-1 rounded text-11-regular border border-border-weaker-base text-text-weak hover:bg-surface-base-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onChip(props.chip === node.nodeId ? 0 : node.nodeId)
                    }}
                  >
                    ▾
                  </button>
                  <Show when={props.chip === node.nodeId}>
                    <div class={`${drop} right-0`}>
                      <For each={KINDS}>
                        {(k) => (
                          <button
                            type="button"
                            class={item}
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onChip(0)
                              props.onInject(k, node)
                            }}
                          >
                            {kindLabel(k)}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
            <Show when={kids() && shown()}>
              <Tree
                nodes={node.children}
                selected={props.selected}
                onSelect={props.onSelect}
                depth={depth() + 1}
                badge={props.badge}
                counts={props.counts}
                work={props.work}
                force={props.force}
                chip={props.chip}
                onChip={props.onChip}
                onInject={props.onInject}
              />
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
  pending?: Record<string, boolean>
  expanded?: string[]
  onExpand?: (path: string, open: boolean) => void
  chip?: number
  onChip: (id: number) => void
  onInject: (kind: ContextKind, node: SourceNode) => void
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
        const pending = () => !!props.pending?.[node.nodePath]
        const on = () => props.selected === node.nodeId
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
            <div
              class="w-full flex items-center gap-1 px-1.5 py-0.5 text-left text-12-regular rounded-md hover:bg-surface-base-hover"
              classList={{
                "bg-surface-base-active text-text-strong": on(),
                "text-text-base": !on(),
              }}
              style={{ "padding-left": `${6 + depth() * 12}px` }}
              title={node.nodePath}
            >
              <Show when={kids()} fallback={<span class="w-3 shrink-0" />}>
                <button type="button" class="w-3 shrink-0 text-text-weak" onClick={toggle}>
                  {open() ? "▾" : "▸"}
                </button>
              </Show>
              <button type="button" class="min-w-0 flex-1 truncate text-left" onClick={() => props.onSelect(node)}>
                {node.nodeName}
              </button>
              <Show when={pending()}>
                <span class="shrink-0 px-1 rounded text-11-regular bg-surface-base-active text-text-weak">…</span>
              </Show>
              <Show when={count() > 0}>
                <span class="shrink-0 text-11-regular text-text-weak">{count()}</span>
              </Show>
              <Show when={on()}>
                <div class="relative shrink-0">
                  <button
                    type="button"
                    class="px-1 rounded text-11-regular border border-border-weaker-base text-text-weak hover:bg-surface-base-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onChip(props.chip === node.nodeId ? 0 : node.nodeId)
                    }}
                  >
                    ▾
                  </button>
                  <Show when={props.chip === node.nodeId}>
                    <div class={`${drop} right-0`}>
                      <For each={KINDS}>
                        {(k) => (
                          <button
                            type="button"
                            class={item}
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onChip(0)
                              props.onInject(k, node)
                            }}
                          >
                            {kindLabel(k)}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
            <Show when={kids() && open()}>
              <SourceTree
                nodes={node.children}
                selected={props.selected}
                onSelect={props.onSelect}
                depth={depth() + 1}
                counts={props.counts}
                pending={props.pending}
                expanded={props.expanded}
                onExpand={props.onExpand}
                chip={props.chip}
                onChip={props.onChip}
                onInject={props.onInject}
              />
            </Show>
          </div>
        )
      }}
    </For>
  )
}

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
  const [baseMapId, setBaseMapId] = createSignal(0)
  const [mapName, setMapName] = createSignal("")
  const [eadCounts, setEadCounts] = createSignal<Record<string, number>>({})
  const [jobCounts, setJobCounts] = createSignal<Record<string, number>>({})
  const [testCounts, setTestCounts] = createSignal<Record<string, number>>({})
  const [pendingPaths, setPendingPaths] = createSignal<Record<string, boolean>>({})
  const [pfmEad, setPfmEad] = createSignal<Record<string, number>>({})
  const [pfmJobs, setPfmJobs] = createSignal<Record<string, number>>({})
  const [pfmTests, setPfmTests] = createSignal<Record<string, number>>({})
  const [hint, setHint] = createSignal<Hint | undefined>()
  const [banner, setBanner] = createSignal<Banner | null>(null)
  const [diag, setDiag] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [pq, setPq] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal("")
  const [user, setUser] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [tab, setTab] = createSignal<AuthTab>("signin")
  const [id, setId] = createSignal("")
  const [pass, setPass] = createSignal("")
  const [showPass, setShowPass] = createSignal(false)
  const [target, setTarget] = createSignal("")
  const [code, setCode] = createSignal("")
  const [username, setUsername] = createSignal("")
  const [signupToken, setSignupToken] = createSignal("")
  const [newPass, setNewPass] = createSignal("")
  const [menu, setMenu] = createSignal<Menu>("")
  const [chip, setChip] = createSignal(0)
  const [members, setMembers] = createSignal<TeamMember[]>([])
  const [multi, setMulti] = createSignal(false)
  const [draftEmails, setDraftEmails] = createSignal<string[]>([])
  const [draftMe, setDraftMe] = createSignal(false)
  const [oq, setOq] = createSignal("")

  let flashTimer: ReturnType<typeof setTimeout> | undefined

  const badgeCounts = createMemo(() => {
    const mode = ead.badge()
    if (mode === "jobs") return jobCounts()
    if (mode === "tests") return testCounts()
    if (mode === "none") return {} as Record<string, number>
    return eadCounts()
  })

  const pfmBadgeCounts = createMemo(() => {
    const mode = ead.badge()
    if (mode === "jobs") return pfmJobs()
    if (mode === "tests") return pfmTests()
    if (mode === "none") return {} as Record<string, number>
    return pfmEad()
  })

  const pfmFilter = createMemo(() => {
    void ead.mapTick()
    return readPfmFilter()
  })

  const owner = createMemo(() => {
    void ead.mapTick()
    return readOwner(ead.productId())
  })

  const countIds = (counts: Record<string, number>) =>
    new Set(
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k]) => Number(k))
        .filter((n) => Number.isFinite(n) && n > 0),
    )

  const pfmVisible = createMemo(() => {
    void ead.mapTick()
    const node = root()
    if (!node) return [] as PfmNode[]
    let nodes = [node]
    const jobs = jobIds()
    if (ead.jobsOnly()) {
      const mode = ead.badge()
      if (mode === "ead") {
        const ids = countIds(pfmEad())
        nodes = ids.size ? filterByIds(nodes, ids) : []
      } else if (mode === "tests") {
        const ids = countIds(pfmTests())
        nodes = ids.size ? filterByIds(nodes, ids) : []
      } else if (jobs) {
        nodes = filterByIds(nodes, jobs)
      }
    }
    const filter = readPfmFilter()
    if (filter.active && filter.ids.length) nodes = filterByIds(nodes, new Set(filter.ids))
    return filterPfm(nodes, query())
  })

  const openPath = createMemo(() => pathIds(pfmVisible(), ead.workContextId()))

  const sourceVisible = createMemo(() => {
    const nodes = ead.eadsOnly()
      ? filterByCount(source(), eadCounts(), pendingPaths(), true)
      : source()
    return filterSource(nodes, query())
  })

  const filtered = createMemo(() => {
    const q = pq().trim().toLowerCase()
    if (!q) return products()
    return products().filter((p) => p.name.toLowerCase().includes(q) || String(p.productId).includes(q))
  })

  const ownerMembers = createMemo(() => {
    const q = oq().trim().toLowerCase()
    if (!q) return members()
    return members().filter(
      (m) => m.label.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    )
  })

  const schemaType = createMemo(() => {
    const sid = ead.subSchemaId()
    if (sid <= 0) return "Base"
    return schemas().find((s) => s.id === sid)?.name || `#${sid}`
  })

  const sourceOpts = () => ({
    productId: ead.productId() || undefined,
    productName: ead.productName() || undefined,
    sourceId: ead.sourceId() || undefined,
    sourcePath: ead.sourcePath() || undefined,
    sourceName: ead.sourceName() || undefined,
  })

  const folder = () => {
    const dir = String(sdk.directory || "").replace(/[/\\]+$/, "")
    const parts = dir.split(/[/\\]/).filter(Boolean)
    return parts[parts.length - 1] || ""
  }

  const flash = (kind: Banner["kind"], text: string) => {
    setBanner({ kind, text })
    if (flashTimer) clearTimeout(flashTimer)
    if (kind !== "ok") return
    flashTimer = setTimeout(() => setBanner(null), 2500)
  }

  const closeMenus = () => {
    setMenu("")
    setChip(0)
  }

  const bump = () => {
    ead.bumpMap()
    if (layout.pluginPanel.opened(EAD_PILOT_ID)()) ead.bumpPilot()
  }

  const launch = (action: Parameters<typeof queuePilot>[0]) => {
    queuePilot(action)
    openPilot(layout.pluginPanel, () => ead.bumpPilot())
  }

  const clearCounts = () => {
    setEadCounts({})
    setJobCounts({})
    setTestCounts({})
    setPendingPaths({})
    setPfmEad({})
    setPfmJobs({})
    setPfmTests({})
  }

  const toggleBadge = (next: "ead" | "jobs" | "tests") => {
    ead.setBadge(ead.badge() === next ? "none" : next)
  }

  const soon = (name: string) => {
    const msg = `${name} coming soon`
    setErr(msg)
    showToast({ title: "EAD", description: msg })
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

  let gen = 0
  const refresh = async () => {
    const run = ++gen
    const live = () => run === gen
    const token = ead.token()
    if (!token) {
      setProducts([])
      setRoot(undefined)
      setSource([])
      setSchemas([])
      setJobIds(undefined)
      setBaseMapId(0)
      setMapName("")
      clearCounts()
      setUser("")
      setEmail("")
      setHint(undefined)
      setBanner(null)
      return
    }
    setBusy(true)
    setErr("")
    flash("loading", "Refreshing EAD Map…")
    try {
      const fetcher = http()
      const profile = await me(token, fetcher)
      if (!live()) return
      setEmail(String(profile?.email || ""))
      setUser(String(profile?.name || profile?.userName || profile?.email || "signed in"))
      const list = await loadProducts(token, fetcher)
      if (!live()) return
      setProducts(list)
      const pid = ead.productId()
      if (pid <= 0) {
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        setBaseMapId(0)
        setMapName("")
        clearCounts()
        const hit = await suggestProduct(token, list, folder(), fetcher)
        if (!live()) return
        setHint(hit ? { productId: hit.productId, name: hit.name } : undefined)
        flash("ok", "Refreshed")
        return
      }
      setHint(undefined)
      const selected = list.find((p) => p.productId === pid)
      if (!selected) {
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        setBaseMapId(0)
        setMapName("")
        clearCounts()
        flash("ok", "Refreshed")
        return
      }
      if (selected.name && selected.name !== ead.productName()) {
        ead.setProduct(selected.productId, selected.name)
      }
      const sub = ead.subSchemaId()
      const map = await loadActiveMap(token, selected.productId, fetcher, sub > 0 ? sub : undefined)
      if (!live()) return
      ead.setMapId(map.mapId)
      setRoot(map.root)
      setBaseMapId(map.baseMapId)
      setMapName(map.mapName || map.root?.name || (map.mapId > 0 ? `Map ${map.mapId}` : ""))
      if (map.supportSubSchemas && map.mapId > 0) {
        const next = await loadSubSchemas(token, map.mapId, fetcher)
        if (!live()) return
        setSchemas(next)
      } else {
        setSchemas([])
      }
      if (map.mapId > 0) {
        const ids = await loadOpenFilterNodeIds(token, map.mapId, fetcher)
        if (!live()) return
        setJobIds(new Set(ids))
      } else {
        setJobIds(undefined)
      }
      if (map.root) {
        const ids = collectIds([map.root])
        const [eads, jobs, tests] = await Promise.all([
          loadPfmEadCounts(token, ids, fetcher),
          loadPfmJobCounts(token, ids, fetcher),
          loadPfmTestCounts(token, ids, fetcher),
        ])
        if (!live()) return
        setPfmEad(rollupCounts([map.root], eads))
        setPfmJobs(rollupCounts([map.root], jobs))
        setPfmTests(rollupCounts([map.root], tests))
      } else {
        setPfmEad({})
        setPfmJobs({})
        setPfmTests({})
      }
      if (ead.view() === "source") await loadSource()
      if (!live()) return
      flash("ok", "Refreshed")
    } catch (e) {
      if (!live()) return
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === "AUTH_EXPIRED") {
        ead.signOut()
        setProducts([])
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        setBaseMapId(0)
        setMapName("")
        clearCounts()
        setUser("")
        setEmail("")
        setHint(undefined)
        setErr("Session expired — please sign in again.")
        flash("error", "Session expired — please sign in again.")
        return
      }
      setErr(msg)
      flash("error", msg)
      setRoot(undefined)
      setSource([])
      setSchemas([])
      setJobIds(undefined)
      setBaseMapId(0)
      setMapName("")
      clearCounts()
    } finally {
      if (live()) setBusy(false)
    }
  }

  createEffect(() => {
    if (!panelOpen()) return
    void ead.token()
    void ead.productId()
    void ead.subSchemaId()
    void refresh()
  })

  createEffect(() => {
    const open = menu()
    const id = chip()
    if (!open && !id) return
    const onDoc = (e: MouseEvent) => {
      const el = e.target
      if (!(el instanceof Element)) return
      if (el.closest("[data-ead-menu]")) return
      closeMenus()
    }
    document.addEventListener("mousedown", onDoc)
    onCleanup(() => document.removeEventListener("mousedown", onDoc))
  })

  onCleanup(() => {
    if (flashTimer) clearTimeout(flashTimer)
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
    closeMenus()
    ead.setNode(node.nodeId, node.name)
    void applyContext(node.nodeId, node.name, "pfm")
  }

  const selectSource = (node: SourceNode) => {
    closeMenus()
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
      setTab(intent === "signup" ? "signup-verify" : "forgot-reset")
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
      setTab("signup-create")
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
      setTab("forgot-success")
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
    setBaseMapId(0)
    setMapName("")
    clearCounts()
    setUser("")
    setEmail("")
    setHint(undefined)
    setBanner(null)
    setQuery("")
    setErr("")
    setTab("signin")
    closeMenus()
  }

  const switchView = async (view: "pfm" | "source") => {
    ead.setView(view)
    setQuery("")
    closeMenus()
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

  const inject = async (kind: ContextKind, nodeId: number, name: string, type: "pfm" | "source") => {
    const token = ead.token()
    if (!token || nodeId <= 0) return
    setBusy(true)
    setErr("")
    try {
      const raw = await loadRawContext(token, nodeId, http(), type)
      const jobs =
        kind === "jobs"
          ? ((await loadJobsForNode(token, nodeId, http())) as Array<{
              jobId?: number
              title?: string
              description?: string
              jobStatus?: number
            }>)
          : []
      const text = formatModal(buildModal(kind, nodeId, name, raw, jobs))
      await sendChat({ text, set: (next) => prompt.set(next) })
      showToast({ title: "EAD", description: `${kindLabel(kind)} drafted in composer.`, variant: "success" })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openOwner = async () => {
    const next = menu() === "owner" ? "" : "owner"
    setMenu(next)
    setChip(0)
    if (next !== "owner") return
    const cur = owner()
    setMulti(false)
    setOq("")
    setDraftMe(!!cur.includeMe && cur.active)
    setDraftEmails(cur.memberEmails.length ? [...cur.memberEmails] : cur.memberEmail ? [cur.memberEmail] : [])
    const token = ead.token()
    const pid = ead.productId()
    if (!token || pid <= 0) return
    try {
      setMembers(await loadTeamMembers(token, pid, http()))
    } catch {
      setMembers([])
    }
  }

  const writeOwnerChoice = (next: Parameters<typeof writeOwner>[1]) => {
    const pid = ead.productId()
    if (pid <= 0) return
    writeOwner(pid, next)
    bump()
  }

  const applyOwner = () => {
    const mails = draftEmails()
    const meOn = draftMe()
    if (!mails.length && !meOn) {
      writeOwnerChoice({
        active: false,
        memberEmail: "",
        memberLabel: "",
        memberEmails: [],
        includeMe: false,
      })
    } else if (!mails.length && meOn) {
      writeOwnerChoice({
        active: true,
        memberEmail: "",
        memberLabel: "",
        memberEmails: [],
        includeMe: true,
      })
    } else if (mails.length === 1 && !meOn) {
      const mail = mails[0]!
      const hit = members().find((m) => m.email === mail)
      writeOwnerChoice({
        active: true,
        memberEmail: mail,
        memberLabel: hit?.label || mail,
        memberEmails: [mail],
        includeMe: false,
      })
    } else {
      const first = mails[0] || ""
      const hit = members().find((m) => m.email === first)
      writeOwnerChoice({
        active: true,
        memberEmail: first,
        memberLabel: hit?.label || first,
        memberEmails: mails,
        includeMe: meOn,
      })
    }
    closeMenus()
  }

  const pickProduct = (product: Product) => {
    setHint(undefined)
    ead.setProduct(product.productId, product.name)
    setMenu("")
    setPq("")
    void refresh()
  }

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
        <div class="size-full flex flex-col border-r border-border-weaker-base min-h-0">
          <div class="shrink-0 px-3 py-2 flex items-center justify-between border-b border-border-weaker-base gap-2">
            <span class="text-14-medium text-text-strong truncate">EAD Map</span>
            <div class="flex items-center gap-1">
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

          <div class="flex-1 min-h-0 flex flex-col">
            <Show
              when={ead.token()}
              fallback={
                <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                  <Show when={tab() === "signin"}>
                    <p class="text-14-medium text-text-strong">Sign in</p>
                    <p class="text-12-regular text-text-weak">Sign in to EAD PFM (eadfm.com)</p>
                    <input
                      class={field}
                      placeholder="Email / phone / login"
                      value={id()}
                      onInput={(e) => setId(e.currentTarget.value)}
                    />
                    <div class="relative">
                      <input
                        type={showPass() ? "text" : "password"}
                        class={`${field} pr-8`}
                        placeholder="Password"
                        value={pass()}
                        onInput={(e) => setPass(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void onLogin()
                        }}
                      />
                      <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 text-11-regular text-text-weak"
                        onClick={() => setShowPass((v) => !v)}
                      >
                        {showPass() ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <button type="button" class="text-12-regular text-text-weak hover:underline" onClick={() => setTab("forgot")}>
                        Forgot password?
                      </button>
                      <Button size="small" variant="primary" disabled={busy()} onClick={() => void onLogin()}>
                        Sign in
                      </Button>
                    </div>
                    <div class="flex items-center gap-2 text-11-regular text-text-weak">
                      <span class="flex-1 border-t border-border-weaker-base" />
                      or continue with
                      <span class="flex-1 border-t border-border-weaker-base" />
                    </div>
                    <div class="flex gap-1">
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("Google")}>
                        Google
                      </Button>
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("GitHub")}>
                        GitHub
                      </Button>
                    </div>
                    <p class="text-12-regular text-text-weak">
                      No account?{" "}
                      <button type="button" class="underline" onClick={() => setTab("signup-start")}>
                        Sign up
                      </button>
                    </p>
                  </Show>

                  <Show when={tab() === "signup-start"}>
                    <p class="text-14-medium text-text-strong">Sign up</p>
                    <p class="text-12-regular text-text-weak">Create an EAD account</p>
                    <input
                      class={field}
                      placeholder="Email or phone"
                      value={target()}
                      onInput={(e) => setTarget(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onSendCode("signup")}>
                      Send code
                    </Button>
                    <div class="flex gap-1">
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("Google")}>
                        Google
                      </Button>
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("GitHub")}>
                        GitHub
                      </Button>
                    </div>
                    <button type="button" class="text-12-regular text-text-weak hover:underline self-start" onClick={() => setTab("signin")}>
                      Back to sign in
                    </button>
                  </Show>

                  <Show when={tab() === "signup-verify"}>
                    <p class="text-14-medium text-text-strong">Verify</p>
                    <p class="text-12-regular text-text-weak">Enter the code sent to {target()}</p>
                    <input
                      class={field}
                      placeholder="6-digit code"
                      value={code()}
                      onInput={(e) => setCode(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onVerify()}>
                      Verify
                    </Button>
                    <button
                      type="button"
                      class="text-12-regular text-text-weak hover:underline self-start"
                      onClick={() => setTab("signup-start")}
                    >
                      Back
                    </button>
                  </Show>

                  <Show when={tab() === "signup-create"}>
                    <p class="text-14-medium text-text-strong">Create account</p>
                    <input
                      class={field}
                      placeholder="Username"
                      value={username()}
                      onInput={(e) => setUsername(e.currentTarget.value)}
                    />
                    <input
                      type="password"
                      class={field}
                      placeholder="Password"
                      value={pass()}
                      onInput={(e) => setPass(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy() || !signupToken()} onClick={() => void onSignup()}>
                      Create
                    </Button>
                  </Show>

                  <Show when={tab() === "forgot"}>
                    <p class="text-14-medium text-text-strong">Forgot password</p>
                    <input
                      class={field}
                      placeholder="Email or phone"
                      value={target()}
                      onInput={(e) => setTarget(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onSendCode("reset")}>
                      Send code
                    </Button>
                    <button type="button" class="text-12-regular text-text-weak hover:underline self-start" onClick={() => setTab("signin")}>
                      Back to sign in
                    </button>
                  </Show>

                  <Show when={tab() === "forgot-reset"}>
                    <p class="text-14-medium text-text-strong">Reset password</p>
                    <input
                      class={field}
                      placeholder="6-digit code"
                      value={code()}
                      onInput={(e) => setCode(e.currentTarget.value)}
                    />
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

                  <Show when={tab() === "forgot-success"}>
                    <p class="text-14-medium text-text-strong">Password updated</p>
                    <p class="text-12-regular text-text-weak">You can sign in with your new password.</p>
                    <Button size="small" variant="primary" onClick={() => setTab("signin")}>
                      Back to sign in
                    </Button>
                  </Show>

                  <Show when={err()}>
                    <p class="text-12-regular text-text-weak break-words">{err()}</p>
                  </Show>
                </div>
              }
            >
              <div class="navigator-chrome shrink-0 px-3 pt-2 pb-1 border-b border-border-weaker-base flex flex-col gap-1.5 relative z-10 overflow-visible">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-11-medium text-text-weak truncate">Select a Product</span>
                  <div class="flex items-center gap-1 shrink-0" data-ead-menu>
                    <Button size="small" variant="secondary" onClick={() => launch({ kind: "dashboard" })}>
                      AI Pilot
                    </Button>
                    <div class="relative">
                      <button
                        type="button"
                        class="h-6 w-6 rounded border border-border-weaker-base text-12-regular text-text-weak hover:bg-surface-base-hover"
                        aria-label="Menu"
                        onClick={() => setMenu(menu() === "user" ? "" : "user")}
                      >
                        ☰
                      </button>
                      <Show when={menu() === "user" || menu() === "lang"}>
                        <div class={`${drop} right-0 w-52`}>
                          <button
                            type="button"
                            class={item}
                            disabled={ead.productId() <= 0}
                            onClick={() => {
                              closeMenus()
                              launch({ kind: "editProduct" })
                            }}
                          >
                            Edit Product
                          </button>
                          <button
                            type="button"
                            class={item}
                            onClick={() => {
                              closeMenus()
                              window.open(`${EAD_SERVER_URL}/welcome/profile`, "_blank")
                            }}
                          >
                            My Profile
                          </button>
                          <button
                            type="button"
                            class={`${item} flex items-center justify-between`}
                            onClick={() => setMenu(menu() === "lang" ? "user" : "lang")}
                          >
                            <span>Language</span>
                            <span class="text-11-regular text-text-weak">{ead.language() === "en" ? "EN" : "中文"}</span>
                          </button>
                          <Show when={menu() === "lang"}>
                            <button
                              type="button"
                              class={`${item} pl-4 ${ead.language() === "en" ? itemActive : ""}`}
                              onClick={() => {
                                ead.setLanguage("en")
                                ead.bumpPilot()
                                closeMenus()
                              }}
                            >
                              English
                            </button>
                            <button
                              type="button"
                              class={`${item} pl-4 ${ead.language() === "zh" ? itemActive : ""}`}
                              onClick={() => {
                                ead.setLanguage("zh")
                                ead.bumpPilot()
                                closeMenus()
                              }}
                            >
                              中文
                            </button>
                          </Show>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <button type="button" class={`${item} text-text-weak`} onClick={onSignOut}>
                            Log out
                          </button>
                          <Show when={user()}>
                            <div class="px-2.5 py-1 text-11-regular text-text-weak truncate">{user()}</div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1" data-ead-menu>
                  <div class="relative flex-1 min-w-0">
                    <button
                      type="button"
                      class="w-full flex items-center gap-2 px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base text-left hover:bg-surface-base-hover"
                      aria-expanded={menu() === "product"}
                      onClick={() => {
                        setMenu(menu() === "product" ? "" : "product")
                        setPq("")
                        setChip(0)
                      }}
                    >
                      <span class="flex-1 min-w-0 truncate text-text-base">
                        {ead.productName() || "Select product…"}
                      </span>
                      <span class="shrink-0 text-text-weak">▾</span>
                    </button>
                    <Show when={menu() === "product"}>
                      <div class={`${drop} left-0 right-0 w-auto max-w-none`}>
                        <div class="px-2 pb-1.5 border-b border-border-weaker-base">
                          <input
                            class={`${field} py-1`}
                            placeholder="Search…"
                            value={pq()}
                            onInput={(e) => setPq(e.currentTarget.value)}
                            autofocus
                          />
                        </div>
                        <div class="max-h-56 overflow-y-auto">
                          <For each={filtered()} fallback={<div class="px-2.5 py-2 text-text-weak">No products</div>}>
                            {(p) => (
                              <button
                                type="button"
                                class={`${item} ${ead.productId() === p.productId ? itemActive : ""}`}
                                onClick={() => pickProduct(p)}
                              >
                                {p.name}
                              </button>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
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

                <Show when={hint() && ead.productId() <= 0}>
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-weaker-base bg-surface-base text-12-regular">
                    <span class="min-w-0 flex-1 truncate text-text-weak">
                      Suggested: <span class="text-text-strong">{hint()!.name}</span>
                    </span>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => {
                        const hit = hint()
                        if (!hit) return
                        pickProduct({ productId: hit.productId, name: hit.name })
                      }}
                    >
                      Use
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => setHint(undefined)}>
                      Dismiss
                    </Button>
                  </div>
                </Show>

                <Show when={ead.mapId() > 0}>
                  <div class="relative flex items-center gap-1.5 min-w-0 text-11-regular" data-ead-menu>
                    <button
                      type="button"
                      class="min-w-0 flex-1 flex items-center gap-1 text-left disabled:cursor-default"
                      disabled={!schemas().length}
                      onClick={() => {
                        if (!schemas().length) return
                        setMenu(menu() === "schema" ? "" : "schema")
                        setChip(0)
                      }}
                    >
                      <span class="shrink-0 text-text-weak">PFM:</span>
                      <span class="min-w-0 truncate text-text-base" style={{ direction: "rtl", "text-align": "left" }}>
                        <bdi>{mapName() || `Map ${ead.mapId()}`}</bdi>
                      </span>
                      <span class="shrink-0 text-text-weak">–</span>
                      <span class="shrink-0 text-text-base">{schemaType()}</span>
                      <Show when={schemas().length}>
                        <span class="shrink-0 text-text-weak">▾</span>
                      </Show>
                    </button>
                    <Show when={baseMapId() > 0}>
                      <span class="shrink-0 px-1.5 rounded-full text-11-regular border border-border-weaker-base text-text-weak">
                        Sibling PFM
                      </span>
                    </Show>
                    <Show when={menu() === "schema"}>
                      <div class={`${drop} left-0`}>
                        <button
                          type="button"
                          class={`${item} ${ead.subSchemaId() <= 0 ? itemActive : ""}`}
                          onClick={() => {
                            ead.setSubSchema(0)
                            closeMenus()
                            void refresh()
                          }}
                        >
                          Base map
                        </button>
                        <For each={schemas()}>
                          {(s) => (
                            <button
                              type="button"
                              class={`${item} ${ead.subSchemaId() === s.id ? itemActive : ""}`}
                              onClick={() => {
                                ead.setSubSchema(s.id)
                                closeMenus()
                                void refresh()
                              }}
                            >
                              {s.name}
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </Show>

                <div class="flex items-center gap-1" data-ead-menu>
                  <input
                    class={`${field} flex-1 py-1`}
                    placeholder={ead.view() === "source" ? "Search source…" : "Search PFM…"}
                    value={query()}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                  <div class="relative shrink-0">
                    <button
                      type="button"
                      class="h-7 w-7 rounded border border-border-weaker-base text-12-regular text-text-weak hover:bg-surface-base-hover"
                      classList={{ "border-border-weak-base bg-surface-base-active": pfmFilter().active }}
                      aria-label="Setup"
                      onClick={() => {
                        setMenu(menu() === "setup" ? "" : "setup")
                        setChip(0)
                      }}
                    >
                      ⋯
                    </button>
                    <Show when={menu() === "setup"}>
                      <div class={`${drop} right-0 w-56`}>
                        <button
                          type="button"
                          class={item}
                          disabled={ead.productId() <= 0}
                          onClick={() => {
                            closeMenus()
                            launch({ kind: "setup" })
                          }}
                        >
                          View and Setup EAD Map
                        </button>
                        <button
                          type="button"
                          class={item}
                          disabled={ead.productId() <= 0}
                          onClick={() => {
                            closeMenus()
                            launch({ kind: "mindmap" })
                          }}
                        >
                          Setup EAD Map Filter
                        </button>
                        <label class={`${item} flex items-center gap-2 cursor-pointer`}>
                          <input
                            type="checkbox"
                            checked={owner().enabled}
                            onChange={(e) => {
                              const pid = ead.productId()
                              if (pid <= 0) return
                              writeOwner(pid, { enabled: e.currentTarget.checked })
                              bump()
                            }}
                          />
                          Enable Job Owner Filter
                        </label>
                        <button
                          type="button"
                          class={`${item} flex items-center justify-between`}
                          onClick={() => {
                            setDiag((v) => !v)
                            closeMenus()
                          }}
                        >
                          <span>Show debug</span>
                          <span class="text-11-regular text-text-weak">{diag() ? "On" : "Off"}</span>
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>

                <Show when={pfmFilter().ids.length > 0}>
                  <div class="flex items-center gap-2 text-11-regular text-text-weak">
                    <span>PFM Node Filter ({pfmFilter().ids.length}):</span>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded border border-border-weaker-base hover:bg-surface-base-hover"
                      classList={{ "text-text-strong border-border-weak-base": pfmFilter().active }}
                      onClick={() => {
                        const cur = pfmFilter()
                        writePfmFilter(cur.ids, !cur.active)
                        bump()
                      }}
                    >
                      {pfmFilter().active ? "On" : "Off"}
                    </button>
                  </div>
                </Show>

                <Show when={owner().enabled}>
                  <div class="relative flex items-center gap-1.5 text-11-regular" data-ead-menu>
                    <span class="shrink-0 text-text-weak">AI Job Owner:</span>
                    <button
                      type="button"
                      class="min-w-0 truncate text-text-base hover:underline"
                      onClick={() => void openOwner()}
                    >
                      {ownerSummary(owner())} ▾
                    </button>
                    <Show when={menu() === "owner"}>
                      <div class={`${drop} left-0 w-64 max-h-80 overflow-y-auto`}>
                        <div class="px-2 pb-1.5 border-b border-border-weaker-base flex items-center gap-1">
                          <input
                            class={`${field} flex-1 py-1`}
                            placeholder="Search members…"
                            value={oq()}
                            onInput={(e) => setOq(e.currentTarget.value)}
                          />
                          <button
                            type="button"
                            class="shrink-0 px-2 py-1 rounded border border-border-weaker-base text-11-regular hover:bg-surface-base-hover"
                            classList={{ "bg-surface-base-active": multi() }}
                            onClick={() => {
                              const next = !multi()
                              setMulti(next)
                              if (!next) return
                              const cur = owner()
                              setDraftMe(!!cur.includeMe && cur.active)
                              setDraftEmails(
                                cur.memberEmails.length
                                  ? [...cur.memberEmails]
                                  : cur.memberEmail
                                    ? [cur.memberEmail]
                                    : [],
                              )
                            }}
                          >
                            {multi() ? "Multi" : "Single"}
                          </button>
                        </div>

                        <Show
                          when={multi()}
                          fallback={
                            <>
                              <button
                                type="button"
                                class={`${item} ${!owner().active ? itemActive : ""}`}
                                onClick={() => {
                                  writeOwnerChoice({
                                    active: false,
                                    memberEmail: "",
                                    memberLabel: "",
                                    memberEmails: [],
                                    includeMe: false,
                                  })
                                  closeMenus()
                                }}
                              >
                                All
                              </button>
                              <Show when={email()}>
                                <button
                                  type="button"
                                  class={`${item} ${owner().active && owner().includeMe && !owner().memberEmails.length ? itemActive : ""}`}
                                  onClick={() => {
                                    writeOwnerChoice({
                                      active: true,
                                      includeMe: true,
                                      memberEmail: "",
                                      memberLabel: "",
                                      memberEmails: [],
                                    })
                                    closeMenus()
                                  }}
                                >
                                  Me
                                </button>
                              </Show>
                              <For each={ownerMembers()}>
                                {(m) => (
                                  <button
                                    type="button"
                                    class={`${item} ${owner().memberEmail === m.email && !owner().includeMe ? itemActive : ""}`}
                                    onClick={() => {
                                      writeOwnerChoice({
                                        active: true,
                                        memberEmail: m.email,
                                        memberLabel: m.label,
                                        memberEmails: [m.email],
                                        includeMe: false,
                                      })
                                      closeMenus()
                                    }}
                                  >
                                    {m.label}
                                  </button>
                                )}
                              </For>
                            </>
                          }
                        >
                          <div class="px-2 py-1.5 flex items-center justify-between gap-2 border-b border-border-weaker-base">
                            <button
                              type="button"
                              class="text-11-regular text-text-weak hover:underline"
                              onClick={() => {
                                const all = members().map((m) => m.email)
                                const full = draftMe() && draftEmails().length === all.length && all.every((e) => draftEmails().includes(e))
                                if (full) {
                                  setDraftMe(false)
                                  setDraftEmails([])
                                  return
                                }
                                setDraftMe(true)
                                setDraftEmails(all)
                              }}
                            >
                              Select all
                            </button>
                            <div class="flex gap-1">
                              <Button size="small" variant="ghost" onClick={() => closeMenus()}>
                                Cancel
                              </Button>
                              <Button size="small" variant="secondary" onClick={applyOwner}>
                                Apply
                              </Button>
                            </div>
                          </div>
                          <label class={`${item} flex items-center gap-2 cursor-pointer`}>
                            <input
                              type="checkbox"
                              checked={draftMe()}
                              onChange={(e) => setDraftMe(e.currentTarget.checked)}
                            />
                            Include me{email() ? ` (${email()})` : ""}
                          </label>
                          <For each={ownerMembers()}>
                            {(m) => (
                              <label class={`${item} flex items-center gap-2 cursor-pointer`}>
                                <input
                                  type="checkbox"
                                  checked={draftEmails().includes(m.email)}
                                  onChange={(e) => {
                                    const on = e.currentTarget.checked
                                    setDraftEmails((prev) =>
                                      on ? [...new Set([...prev, m.email])] : prev.filter((x) => x !== m.email),
                                    )
                                  }}
                                />
                                <span class="truncate">{m.label}</span>
                              </label>
                            )}
                          </For>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>

              <div class="navigator-scroll flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
                <Show when={banner()}>
                  <div
                    class="px-2 py-1 rounded text-11-regular border"
                    classList={{
                      "border-border-weaker-base text-text-weak": banner()!.kind === "loading",
                      "border-border-weak-base text-text-strong bg-surface-base-active": banner()!.kind === "ok",
                      "border-border-weak-base text-text-weak": banner()!.kind === "error",
                    }}
                  >
                    {banner()!.text}
                  </div>
                </Show>

                <Show when={diag()}>
                  <pre class="px-2 py-1.5 rounded border border-border-weaker-base text-11-regular font-mono text-text-weak whitespace-pre-wrap break-words">
                    {`productId=${ead.productId()}
mapId=${ead.mapId()}
view=${ead.view()}
badge=${ead.badge()}
jobsOnly=${ead.jobsOnly()}
workContextId=${ead.workContextId()}
err=${err() || "-"}`}
                  </pre>
                </Show>

                <div class="tree-toolbar-row flex items-center gap-1 flex-wrap" data-ead-menu>
                  <div class="relative">
                    <button
                      type="button"
                      class="px-2 py-1 rounded border border-border-weaker-base text-11-regular text-text-base hover:bg-surface-base-hover"
                      onClick={() => setMenu(menu() === "view" ? "" : "view")}
                    >
                      {ead.view() === "source" ? "AI Code" : "PFM Tree View"} ▾
                    </button>
                    <Show when={menu() === "view"}>
                      <div class={drop}>
                        <button
                          type="button"
                          class={`${item} ${ead.view() === "pfm" ? itemActive : ""}`}
                          onClick={() => void switchView("pfm")}
                        >
                          PFM Tree View
                        </button>
                        <button
                          type="button"
                          class={`${item} ${ead.view() === "source" ? itemActive : ""}`}
                          onClick={() => void switchView("source")}
                        >
                          AI Code
                        </button>
                      </div>
                    </Show>
                  </div>

                  <Show when={ead.view() === "pfm"}>
                    <div class="relative">
                      <button
                        type="button"
                        class="px-2 py-1 rounded border border-border-weaker-base text-11-regular text-text-base hover:bg-surface-base-hover"
                        title={`${ead.badge()} · ${ead.jobsOnly() ? "Filtered" : "All"}`}
                        onClick={() => setMenu(menu() === "job" ? "" : "job")}
                      >
                        Filter
                        <Show when={ead.badge() !== "none" || ead.jobsOnly()}>
                          <span class="ml-1 text-text-weak">
                            · {ead.badge() === "none" ? "none" : ead.badge()}
                            {ead.jobsOnly() ? " · Filtered" : ""}
                          </span>
                        </Show>
                      </button>
                      <Show when={menu() === "job"}>
                        <div class={`${drop} w-44`}>
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">Badge</div>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "ead" ? itemActive : ""}`}
                            onClick={() => toggleBadge("ead")}
                          >
                            EAD
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "jobs" ? itemActive : ""}`}
                            onClick={() => toggleBadge("jobs")}
                          >
                            Jobs
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "tests" ? itemActive : ""}`}
                            onClick={() => toggleBadge("tests")}
                          >
                            Tests
                          </button>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">Scope</div>
                          <button
                            type="button"
                            class={`${item} ${!ead.jobsOnly() ? itemActive : ""}`}
                            onClick={() => {
                              ead.setJobsOnly(false)
                              setMenu("")
                            }}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.jobsOnly() ? itemActive : ""}`}
                            onClick={() => {
                              ead.setJobsOnly(true)
                              setMenu("")
                            }}
                          >
                            Filtered
                          </button>
                        </div>
                      </Show>
                    </div>
                  </Show>

                  <Show when={ead.view() === "source"}>
                    <div class="relative ml-auto">
                      <button
                        type="button"
                        class="h-7 w-7 rounded border border-border-weaker-base text-12-regular text-text-weak hover:bg-surface-base-hover"
                        aria-label="EAD run"
                        onClick={() => setMenu(menu() === "run" ? "" : "run")}
                      >
                        ⋯
                      </button>
                      <Show when={menu() === "run"}>
                        <div class={`${drop} right-0 w-52`}>
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">Tree badges</div>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "ead" ? itemActive : ""}`}
                            onClick={() => toggleBadge("ead")}
                          >
                            Show EAD
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "jobs" ? itemActive : ""}`}
                            onClick={() => toggleBadge("jobs")}
                          >
                            Open Jobs
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "tests" ? itemActive : ""}`}
                            onClick={() => toggleBadge("tests")}
                          >
                            Open Tests
                          </button>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">Source tree</div>
                          <button
                            type="button"
                            class={`${item} ${!ead.eadsOnly() ? itemActive : ""}`}
                            onClick={() => ead.setEadsOnly(false)}
                          >
                            Show all
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.eadsOnly() ? itemActive : ""}`}
                            onClick={() => ead.setEadsOnly(true)}
                          >
                            With EADs
                          </button>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <button
                            type="button"
                            class={item}
                            disabled={ead.productId() <= 0}
                            onClick={() => {
                              closeMenus()
                              launch({ kind: "setupSource" })
                            }}
                          >
                            Setup Source Tree
                          </button>
                          <button
                            type="button"
                            class={item}
                            disabled={ead.productId() <= 0}
                            onClick={() => {
                              closeMenus()
                              launch({ kind: "find", ...sourceOpts() })
                            }}
                          >
                            AI Find / Create
                          </button>
                          <button
                            type="button"
                            class={item}
                            disabled={ead.sourceId() <= 0}
                            onClick={() => {
                              closeMenus()
                              launch({ kind: "create", ...sourceOpts() })
                            }}
                          >
                            Analyze & Create EAD
                          </button>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>

                <Show when={ead.view() === "source"}>
                  <div class="source-scope-bar flex gap-1" data-ead-menu>
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded text-11-regular border border-border-weaker-base"
                      classList={{ "bg-surface-base-active text-text-strong": !ead.eadsOnly() }}
                      onClick={() => ead.setEadsOnly(false)}
                    >
                      Show all source
                    </button>
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded text-11-regular border border-border-weaker-base"
                      classList={{ "bg-surface-base-active text-text-strong": ead.eadsOnly() }}
                      onClick={() => ead.setEadsOnly(true)}
                    >
                      Show with EADs
                    </button>
                  </div>
                </Show>

                <Show when={busy() && !banner()}>
                  <span class="text-12-regular text-text-weak">Loading…</span>
                </Show>

                <Show when={ead.view() === "pfm"}>
                  <Show when={pfmVisible().length}>
                    <div class="flex flex-col gap-0.5">
                      <Tree
                        nodes={pfmVisible()}
                        selected={ead.nodeId()}
                        onSelect={selectNode}
                        badge={ead.badge()}
                        counts={pfmBadgeCounts()}
                        work={ead.workContextId()}
                        force={openPath()}
                        chip={chip()}
                        onChip={setChip}
                        onInject={(kind, node) => void inject(kind, node.nodeId, node.name, "pfm")}
                      />
                    </div>
                  </Show>
                  <Show when={!busy() && ead.productId() > 0 && !root()}>
                    <span class="text-12-regular text-text-weak">No active PFM map for this product.</span>
                  </Show>
                  <Show when={!busy() && root() && pfmVisible().length === 0 && (query().trim() || ead.jobsOnly() || pfmFilter().active)}>
                    <span class="text-12-regular text-text-weak">No matching nodes.</span>
                  </Show>
                </Show>

                <Show when={ead.view() === "source"}>
                  <Show when={sourceVisible().length}>
                    <div class="flex flex-col gap-0.5">
                      <SourceTree
                        nodes={sourceVisible()}
                        selected={ead.sourceId()}
                        onSelect={selectSource}
                        counts={badgeCounts()}
                        pending={pendingPaths()}
                        expanded={ead.expanded(ead.schemaId())}
                        onExpand={onExpand}
                        chip={chip()}
                        onChip={setChip}
                        onInject={(kind, node) => void inject(kind, node.nodeId, node.nodeName, "source")}
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

                <Show when={err()}>
                  <p class="text-12-regular text-text-weak break-words">{err()}</p>
                </Show>
              </div>
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
