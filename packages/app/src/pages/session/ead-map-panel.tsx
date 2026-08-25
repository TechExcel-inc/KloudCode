import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { useParams } from "@solidjs/router"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import type { Sizing } from "@/pages/session/helpers"
import { queuePilot } from "@/ead/actions"
import {
  createJob,
  loadActiveMap,
  loadCatalog,
  loadContext,
  loadJobsForNode,
  loadLinkPaths,
  loadLinkedBundle,
  loadOpenFilterNodeIds,
  loadPfmEadCounts,
  loadPfmJobCounts,
  loadPfmTestCounts,
  loadRawContext,
  loadRunPrefs,
  loadSourceSchema,
  loadSubSchemas,
  loadSubtreePaths,
  loadTeamMembers,
  login,
  me,
  productRole,
  resetPassword,
  saveRunPrefs,
  selectSourcePath,
  sendCode,
  signup,
  suggestProduct,
  verifyCode,
  type Group,
  type PfmNode,
  type Product,
  type SubSchema,
  type TeamMember,
} from "@/ead/api"
import { openPilot } from "@/ead/bridge"
import { sendChat } from "@/ead/composer"
import { ConfirmDialog, ContextDialog } from "@/ead/context-dialog"
import { buildModal, formatModal, kindLabel, type ContextKind } from "@/ead/context-modal"
import { beginDiag, formatDiag, noteDiag } from "@/ead/diag"
import { clearEadMcp, ensureEadMcp } from "@/ead/ensure-mcp"
import { ownerSummary, readOwner, readPfmFilter, writeOwner, writePfmFilter } from "@/ead/filters"
import { type TipId } from "@/ead/help-tips"
import { t, type Lang } from "@/ead/i18n"
import { expandKey, useEad } from "@/ead/settings"
import { eadHttp } from "@/ead/http"
import {
  buildTree,
  collectIds,
  filterByCount,
  filterByIds,
  filterDisplay,
  filterLinked,
  filterLinkedTree,
  filterPfm,
  filterSource,
  filteredCounts,
  idCounts,
  parseRows,
  pathIds,
  pathTrail,
  rollupCounts,
  type SourceNode,
} from "@/ead/source-tree"
import { EAD_MAP_ID, EAD_MAP_MAX, EAD_MAP_MIN, EAD_MAP_WIDTH, EAD_PILOT_ID, eadApi, eadServer } from "@/ead/urls"

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

function seedOpen(nodes: PfmNode[], depth = 0): number[] {
  return nodes.flatMap((node) => {
    if (depth >= 2) return []
    return [node.nodeId, ...seedOpen(node.children, depth + 1)]
  })
}

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
  pulse?: number
  lang: Lang
  expanded?: number[]
  onToggle?: (id: number, open: boolean) => void
  onChip: (id: number) => void
  onInject: (kind: ContextKind, node: PfmNode) => void
}) {
  const depth = () => props.depth ?? 0
  return (
    <For each={props.nodes}>
      {(node) => {
        const controlled = () => Array.isArray(props.expanded)
        const [local, setLocal] = createSignal(depth() < 2)
        const open = () => (controlled() ? props.expanded!.includes(node.nodeId) : local())
        const kids = () => node.children.length > 0
        const on = () => props.selected === node.nodeId
        const work = () => !!props.work && props.work === node.nodeId && !on()
        const shown = () => !!props.force?.includes(node.nodeId) || open()
        const flash = () => !!props.pulse && props.pulse === node.nodeId
        const count = () => Number(props.counts?.[String(node.nodeId)] || 0)
        const label = () => {
          const n = count()
          if (n <= 0 || !props.badge || props.badge === "none") return ""
          if (props.badge === "ead") return `EAD ${n}`
          if (props.badge === "jobs") return `Jobs ${n}`
          return `Tests ${n}`
        }
        const toggle = (e: MouseEvent) => {
          e.stopPropagation()
          const next = !open()
          if (controlled() && props.onToggle) {
            props.onToggle(node.nodeId, next)
            return
          }
          setLocal(next)
        }
        return (
          <div>
            <div
              class="w-full flex items-center gap-1 px-1.5 py-0.5 text-left text-12-regular rounded-md hover:bg-surface-base-hover group"
              classList={{
                "bg-surface-base-active text-text-strong": on(),
                "text-sky-400": work(),
                "text-text-base": !on() && !work(),
                "ring-1 ring-sky-400/80": flash(),
              }}
              style={{ "padding-left": `${6 + depth() * 12}px` }}
              data-ead-node={node.nodeId}
            >
              <Show when={kids()} fallback={<span class="w-3 shrink-0" />}>
                <button type="button" class="w-3 shrink-0 text-text-weak" onClick={toggle}>
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
                            {kindLabel(k, props.lang)}
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
                pulse={props.pulse}
                lang={props.lang}
                expanded={props.expanded}
                onToggle={props.onToggle}
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
  pulse?: number
  lang: Lang
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
        const flash = () => !!props.pulse && props.pulse === node.nodeId
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
                "ring-1 ring-sky-400/80": flash(),
              }}
              style={{ "padding-left": `${6 + depth() * 12}px` }}
              title={node.nodePath}
              data-ead-source={node.nodeId}
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
                            {kindLabel(k, props.lang)}
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
                pulse={props.pulse}
                lang={props.lang}
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

function mark(role: ReturnType<typeof productRole>, lang: Lang) {
  if (role === "sibling") return { cls: "text-sky-400", title: t(lang, "siblingProduct"), glyph: "◇" }
  if (role === "base") return { cls: "text-violet-400", title: t(lang, "baseSiblings"), glyph: "▣" }
  return { cls: "text-text-weak", title: "", glyph: "•" }
}

function Choice(props: {
  product: Product
  active: boolean
  lang: Lang
  onPick: (product: Product) => void
}) {
  const role = () => productRole(props.product)
  const meta = () => mark(role(), props.lang)
  return (
    <button
      type="button"
      class={`${item} flex items-center gap-1.5 ${props.active ? itemActive : ""}`}
      title={meta().title}
      onClick={() => props.onPick(props.product)}
    >
      <span class={`shrink-0 text-11-regular ${meta().cls}`} aria-hidden="true">
        {meta().glyph}
      </span>
      <span class="min-w-0 truncate">{props.product.name}</span>
    </button>
  )
}

export function EadMapPanel(props: { sizing: Sizing }) {
  const layout = useLayout()
  const language = useLanguage()
  const prompt = usePrompt()
  const params = useParams()
  const ead = useEad()
  const sdk = useSDK()
  const dialog = useDialog()
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const http = () => eadHttp()
  const lang = () => ead.language()
  const tx = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(lang(), key, vars)

  const opened = layout.pluginPanel.opened(EAD_MAP_ID)
  const width = layout.pluginPanel.width(EAD_MAP_ID)
  const panelOpen = createMemo(() => isDesktop() && opened())
  const panelWidth = createMemo(() => (panelOpen() ? `${width()}px` : "0px"))

  const [products, setProducts] = createSignal<Product[]>([])
  const [groups, setGroups] = createSignal<Group[]>([])
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
  const [confirmPass, setConfirmPass] = createSignal("")
  const [userId, setUserId] = createSignal(0)
  const [tenantId, setTenantId] = createSignal(0)
  const [pipeline, setPipeline] = createSignal("")
  const [menu, setMenu] = createSignal<Menu>("")
  const [chip, setChip] = createSignal(0)
  const [members, setMembers] = createSignal<TeamMember[]>([])
  const [multi, setMulti] = createSignal(false)
  const [draftEmails, setDraftEmails] = createSignal<string[]>([])
  const [draftMe, setDraftMe] = createSignal(false)
  const [oq, setOq] = createSignal("")
  const [pulse, setPulse] = createSignal(0)

  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let pulseTimer: ReturnType<typeof setTimeout> | undefined

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
    return readPfmFilter(ead.productId())
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
    const filter = readPfmFilter(ead.productId())
    if (filter.active && filter.ids.length) nodes = filterByIds(nodes, new Set(filter.ids))
    return filterPfm(nodes, query())
  })

  const openPath = createMemo(() => pathIds(pfmVisible(), ead.workContextId()))

  const sourceVisible = createMemo(() => {
    void ead.mapTick()
    const filter = readPfmFilter(ead.productId())
    const base = ead.eadsOnly()
      ? filterByCount(source(), eadCounts(), pendingPaths(), true)
      : source()
    const nodes = filter.active ? filterLinkedTree(base, filter.paths) : base
    return filterSource(nodes, query())
  })

  const filtered = createMemo(() => {
    const q = pq().trim().toLowerCase()
    if (!q) return products()
    return products().filter((p) => p.name.toLowerCase().includes(q) || String(p.productId).includes(q))
  })

  const grouped = createMemo(() => {
    const q = pq().trim().toLowerCase()
    return groups().flatMap((g) => {
      const list = q
        ? g.products.filter((p) => p.name.toLowerCase().includes(q) || String(p.productId).includes(q))
        : g.products
      if (!list.length) return []
      return [{ ...g, products: list }]
    })
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
  }

  const launch = (action: Parameters<typeof queuePilot>[0]) => {
    queuePilot(action)
    openPilot(layout.pluginPanel)
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

  const persistRun = () => {
    const token = ead.token()
    const sid = ead.schemaId()
    if (!token || sid <= 0 || userId() <= 0 || tenantId() <= 0) return
    void saveRunPrefs(
      token,
      userId(),
      tenantId(),
      sid,
      {
        showEadCount: ead.badge() === "ead",
        showOpenJobs: ead.badge() === "jobs",
        showOpenTests: ead.badge() === "tests",
        eadsOnlyFilter: ead.eadsOnly(),
      },
      http(),
    )
  }

  const toggleBadge = (next: "ead" | "jobs" | "tests") => {
    ead.setBadge(ead.badge() === next ? "none" : next)
    persistRun()
  }

  const soon = (name: string) => {
    const msg = tx("comingSoon", { name })
    setErr(msg)
    showToast({ title: "EAD", description: msg })
  }

  const fillPaths = async (ids: number[], pid: number) => {
    const token = ead.token()
    if (!token || !ids.length) return [] as string[]
    const paths = await loadSubtreePaths(token, ids, http())
    writePfmFilter(ids, true, paths, pid)
    bump()
    return paths
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
    const pref = ead.sourcePref(used)
    if (pref) {
      ead.setBadge(pref.badge)
      ead.setEadsOnly(pref.eadsOnly)
    } else if (userId() > 0 && tenantId() > 0) {
      const remote = await loadRunPrefs(token, userId(), tenantId(), used, http())
      if (remote) {
        const badge = remote.showOpenJobs ? "jobs" : remote.showOpenTests ? "tests" : "ead"
        const only = remote.eadsOnlyFilter !== false
        ead.setSourcePref(used, { badge, eadsOnly: only })
        ead.setBadge(badge)
        ead.setEadsOnly(only)
      }
    }
    const filter = readPfmFilter(pid)
    if (filter.active && filter.ids.length && !filter.paths.length) {
      const paths = await loadSubtreePaths(token, filter.ids, http())
      writePfmFilter(filter.ids, true, paths, pid)
    }
    const active = readPfmFilter(pid)
    if (active.active && active.ids.length) {
      const parsed = parseRows(rows)
      const linked = await Promise.all(
        active.ids.map(async (nid) => ({ nodeId: nid, paths: await loadLinkPaths(token, nid, http()) })),
      )
      const raw = await loadPfmEadCounts(token, active.ids, http())
      const byPfm: Record<number, number> = {}
      for (const [key, value] of Object.entries(raw)) {
        const n = Number(key)
        if (Number.isFinite(n) && n > 0) byPfm[n] = value
      }
      const byPath = filteredCounts(
        parsed.map((row) => row.nodePath),
        linked.filter((n) => n.paths.length),
        byPfm,
      )
      if (Object.keys(byPath).length) {
        eads = idCounts(parsed, byPath)
      } else {
        const kept = filterLinked(parsed, active.paths)
        const fallback: Record<string, number> = {}
        for (const row of kept) {
          const n = eads[String(row.nodeId)]
          if (n > 0) fallback[row.nodePath] = n
        }
        eads = idCounts(kept, fallback)
      }
    }
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
  const refresh = async (opts?: { soft?: boolean; syncLinked?: boolean }) => {
    const run = ++gen
    const live = () => run === gen
    const soft = opts?.soft === true
    const token = ead.token()
    beginDiag()
    noteDiag("Startup", true, soft ? "Soft refresh" : "Loading product list from API")
    if (!token) {
      setProducts([])
      setGroups([])
      setRoot(undefined)
      setSource([])
      setSchemas([])
      setJobIds(undefined)
      setBaseMapId(0)
      setMapName("")
      clearCounts()
      setUser("")
      setEmail("")
      setUserId(0)
      setTenantId(0)
      setHint(undefined)
      setBanner(null)
      setPipeline(formatDiag())
      return
    }
    if (!soft) {
      setBusy(true)
      setErr("")
      flash("loading", tx("refreshing"))
    }
    try {
      const fetcher = http()
      const profile = await me(token, fetcher)
      if (!live()) return
      setEmail(String(profile?.email || ""))
      setUser(String(profile?.name || profile?.userName || profile?.email || tx("signedIn")))
      setUserId(profile.userId)
      setTenantId(profile.tenantId)
      noteDiag("Auth", true, profile.email || profile.userName || "ok")
      const catalog = await loadCatalog(token, fetcher)
      if (!live()) return
      setProducts(catalog.products)
      setGroups(catalog.groups)
      noteDiag("Products", true, `${catalog.products.length} products, ${catalog.groups.length} groups`)
      const pid = ead.productId()
      if (pid <= 0) {
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        setBaseMapId(0)
        setMapName("")
        clearCounts()
        const hit = await suggestProduct(token, catalog.products, folder(), fetcher)
        if (!live()) return
        setHint(hit ? { productId: hit.productId, name: hit.name } : undefined)
        noteDiag("Load complete", true, "No product selected")
        setPipeline(formatDiag())
        if (!soft) flash("ok", tx("refreshed"))
        return
      }
      setHint(undefined)
      const selected = catalog.products.find((p) => p.productId === pid)
      if (!selected) {
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        setBaseMapId(0)
        setMapName("")
        clearCounts()
        noteDiag("Load complete", true, "Selected product missing")
        setPipeline(formatDiag())
        if (!soft) flash("ok", tx("refreshed"))
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
      noteDiag("Map", true, `mapId=${map.mapId} name=${map.mapName || map.root?.name || "-"}`)
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
      if (ead.view() === "source" || opts?.syncLinked === true) await loadSource(opts?.syncLinked === true)
      if (!live()) return
      noteDiag(
        "Load complete",
        true,
        `PFM nodes: ${map.root ? collectIds([map.root]).length : 0}, view: ${ead.view()}`,
      )
      setPipeline(formatDiag())
      if (!soft) flash("ok", tx("refreshed"))
    } catch (e) {
      if (!live()) return
      const msg = e instanceof Error ? e.message : String(e)
      noteDiag("Error", false, msg)
      setPipeline(formatDiag())
      if (msg === "AUTH_EXPIRED") {
        ead.signOut()
        setProducts([])
        setGroups([])
        setRoot(undefined)
        setSource([])
        setSchemas([])
        setJobIds(undefined)
        setBaseMapId(0)
        setMapName("")
        clearCounts()
        setUser("")
        setEmail("")
        setUserId(0)
        setTenantId(0)
        setHint(undefined)
        setErr(tx("expired"))
        if (!soft) flash("error", tx("expired"))
        return
      }
      setErr(msg)
      if (!soft) flash("error", msg)
      setRoot(undefined)
      setSource([])
      setSchemas([])
      setJobIds(undefined)
      setBaseMapId(0)
      setMapName("")
      clearCounts()
    } finally {
      if (live() && !soft) setBusy(false)
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
    if (!panelOpen()) return
    const timer = window.setInterval(() => {
      if (!ead.token()) return
      void refresh({ soft: true })
    }, 8_000)
    onCleanup(() => window.clearInterval(timer))
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
    if (pulseTimer) clearTimeout(pulseTimer)
  })

  const applyContext = async (nodeId: number, nodeName: string, type: "pfm" | "source") => {
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
    if (layout.pluginPanel.opened(EAD_PILOT_ID)()) {
      queuePilot({
        kind: "pfm",
        nodeId: node.nodeId,
        nodeName: node.name,
      })
    }
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

  const pfmExpandKey = () => expandKey(ead.productId(), ead.mapId(), ead.subSchemaId())

  const pfmExpandedIds = createMemo(() => {
    const key = pfmExpandKey()
    const saved = ead.pfmExpanded(key)
    if (saved !== undefined) return saved
    const nodes = pfmVisible()
    return nodes.length ? seedOpen(nodes) : []
  })

  const onPfmToggle = (id: number, open: boolean) => {
    const key = pfmExpandKey()
    const prev = ead.pfmExpanded(key) ?? seedOpen(pfmVisible())
    const next = open ? [...new Set([...prev, id])] : prev.filter((n) => n !== id)
    ead.setPfmExpanded(key, next)
  }

  const ring = (id: number) => {
    setPulse(id)
    if (pulseTimer) clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => {
      setPulse((cur) => (cur === id ? 0 : cur))
    }, 1600)
  }

  createEffect(() => {
    if (!panelOpen()) return
    const tick = ead.mapTick()
    if (!(tick > 0)) return
    const nid = ead.nodeId()
    const sid = ead.sourceId()
    untrack(() => {
      if (nid > 0) {
        if (ead.view() !== "pfm") ead.setView("pfm")
        const nodes = pfmVisible()
        const trail = pathIds(nodes, nid)
        const key = pfmExpandKey()
        const prev = ead.pfmExpanded(key) ?? seedOpen(nodes)
        const next = [...new Set([...prev, ...trail, nid])]
        if (next.length !== prev.length || next.some((id) => !prev.includes(id))) {
          ead.setPfmExpanded(key, next)
        }
        ring(nid)
        queueMicrotask(() => {
          document.querySelector(`[data-ead-node="${nid}"]`)?.scrollIntoView({ block: "nearest" })
        })
        return
      }
      if (!(sid > 0)) return
      if (ead.view() !== "source") ead.setView("source")
      const schema = ead.schemaId()
      const trail = pathTrail(sourceVisible(), sid)
      if (schema > 0 && trail.length) {
        const prev = ead.expanded(schema)
        const next = [...new Set([...prev, ...trail])]
        if (next.length !== prev.length || next.some((path) => !prev.includes(path))) {
          ead.setExpanded(schema, next)
        }
      }
      ring(sid)
      queueMicrotask(() => {
        document.querySelector(`[data-ead-source="${sid}"]`)?.scrollIntoView({ block: "nearest" })
      })
    })
  })

  const openHelp = (tipId: TipId) => {
    closeMenus()
    launch({ kind: "help", tipId })
  }

  const afterAuth = async (token: string) => {
    ead.setToken(token)
    setPass("")
    setNewPass("")
    setConfirmPass("")
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
    if (pass() !== confirmPass()) {
      setErr(tx("mismatch"))
      return
    }
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
    if (newPass() !== confirmPass()) {
      setErr(tx("mismatch"))
      return
    }
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
    setGroups([])
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
    closeMenus()
    setBusy(true)
    setErr("")
    try {
      const raw = await loadRawContext(token, nodeId, http(), type)
      const jobs = kind === "jobs" ? await loadJobsForNode(token, nodeId, http()) : []
      const payload = buildModal(kind, nodeId, name, raw, jobs as never)
      const text = formatModal(payload)
      dialog.show(() => (
        <ContextDialog
          title={kindLabel(kind, lang())}
          payload={payload}
          text={text}
          lang={lang()}
          onInject={async (body) =>
            sendChat({
              text: body,
              set: (value) => prompt.set(value),
              client: sdk.client,
              sessionID: params.id,
              auto: true,
            })
          }
          onCreate={
            kind === "jobs" && type === "pfm"
              ? async (title, desc) => {
                  await createJob(token, { pfmNodeId: nodeId, title, description: desc }, http())
                  const next = await loadJobsForNode(token, nodeId, http())
                  const body = formatModal(buildModal("jobs", nodeId, name, raw, next as never))
                  await sendChat({
                    text: body,
                    set: (value) => prompt.set(value),
                    client: sdk.client,
                    sessionID: params.id,
                    auto: true,
                  })
                  showToast({ title: "EAD", description: tx("sent"), variant: "success" })
                  void refresh({ soft: true, syncLinked: false })
                }
              : undefined
          }
        />
      ))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      flash("error", msg)
    } finally {
      setBusy(false)
    }
  }

  const askEdit = () => {
    closeMenus()
    dialog.show(() => (
      <ConfirmDialog
        title={tx("editTitle")}
        message={tx("editMessage")}
        confirm={tx("continue")}
        onConfirm={() => launch({ kind: "editProduct" })}
      />
    ))
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
            <span class="text-14-medium text-text-strong truncate">{tx("title")}</span>
            <div class="flex items-center gap-1">
              <IconButton icon="expand" variant="ghost" class="h-5 w-5" onClick={() => void refresh({ syncLinked: true })} aria-label={tx("refresh")} />
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
                    <p class="text-14-medium text-text-strong">{tx("signIn")}</p>
                    <p class="text-12-regular text-text-weak">{tx("signInHint")}</p>
                    <input
                      class={field}
                      placeholder={tx("idPlaceholder")}
                      value={id()}
                      onInput={(e) => setId(e.currentTarget.value)}
                    />
                    <div class="relative">
                      <input
                        type={showPass() ? "text" : "password"}
                        class={`${field} pr-8`}
                        placeholder={tx("password")}
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
                        {showPass() ? tx("hide") : tx("show")}
                      </button>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <button type="button" class="text-12-regular text-text-weak hover:underline" onClick={() => setTab("forgot")}>
                        {tx("forgot")}
                      </button>
                      <Button size="small" variant="primary" disabled={busy()} onClick={() => void onLogin()}>
                        {tx("signIn")}
                      </Button>
                    </div>
                    <div class="flex items-center gap-2 text-11-regular text-text-weak">
                      <span class="flex-1 border-t border-border-weaker-base" />
                      {tx("orContinue")}
                      <span class="flex-1 border-t border-border-weaker-base" />
                    </div>
                    <div class="flex gap-1">
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("Google")}>
                        {tx("google")}
                      </Button>
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("GitHub")}>
                        {tx("github")}
                      </Button>
                    </div>
                    <p class="text-12-regular text-text-weak">
                      {tx("noAccount")}{" "}
                      <button type="button" class="underline" onClick={() => setTab("signup-start")}>
                        {tx("signUp")}
                      </button>
                    </p>
                  </Show>

                  <Show when={tab() === "signup-start"}>
                    <p class="text-14-medium text-text-strong">{tx("signUp")}</p>
                    <p class="text-12-regular text-text-weak">{tx("signUpHint")}</p>
                    <input
                      class={field}
                      placeholder={tx("targetPlaceholder")}
                      value={target()}
                      onInput={(e) => setTarget(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onSendCode("signup")}>
                      {tx("sendCode")}
                    </Button>
                    <div class="flex gap-1">
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("Google")}>
                        {tx("google")}
                      </Button>
                      <Button size="small" variant="secondary" class="flex-1" onClick={() => soon("GitHub")}>
                        {tx("github")}
                      </Button>
                    </div>
                    <button type="button" class="text-12-regular text-text-weak hover:underline self-start" onClick={() => setTab("signin")}>
                      {tx("backSignIn")}
                    </button>
                  </Show>

                  <Show when={tab() === "signup-verify"}>
                    <p class="text-14-medium text-text-strong">{tx("verify")}</p>
                    <p class="text-12-regular text-text-weak">{tx("verifyHint", { target: target() })}</p>
                    <input
                      class={field}
                      placeholder={tx("codePlaceholder")}
                      value={code()}
                      onInput={(e) => setCode(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onVerify()}>
                      {tx("verify")}
                    </Button>
                    <button
                      type="button"
                      class="text-12-regular text-text-weak hover:underline self-start"
                      onClick={() => setTab("signup-start")}
                    >
                      {tx("back")}
                    </button>
                  </Show>

                  <Show when={tab() === "signup-create"}>
                    <p class="text-14-medium text-text-strong">{tx("createAccount")}</p>
                    <input
                      class={field}
                      placeholder={tx("username")}
                      value={username()}
                      onInput={(e) => setUsername(e.currentTarget.value)}
                    />
                    <input
                      type="password"
                      class={field}
                      placeholder={tx("password")}
                      value={pass()}
                      onInput={(e) => setPass(e.currentTarget.value)}
                    />
                    <input
                      type="password"
                      class={field}
                      placeholder={tx("confirmPassword")}
                      value={confirmPass()}
                      onInput={(e) => setConfirmPass(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy() || !signupToken()} onClick={() => void onSignup()}>
                      {tx("create")}
                    </Button>
                  </Show>

                  <Show when={tab() === "forgot"}>
                    <p class="text-14-medium text-text-strong">{tx("forgotTitle")}</p>
                    <input
                      class={field}
                      placeholder={tx("targetPlaceholder")}
                      value={target()}
                      onInput={(e) => setTarget(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onSendCode("reset")}>
                      {tx("sendCode")}
                    </Button>
                    <button type="button" class="text-12-regular text-text-weak hover:underline self-start" onClick={() => setTab("signin")}>
                      {tx("backSignIn")}
                    </button>
                  </Show>

                  <Show when={tab() === "forgot-reset"}>
                    <p class="text-14-medium text-text-strong">{tx("resetTitle")}</p>
                    <input
                      class={field}
                      placeholder={tx("codePlaceholder")}
                      value={code()}
                      onInput={(e) => setCode(e.currentTarget.value)}
                    />
                    <input
                      type="password"
                      class={field}
                      placeholder={tx("newPassword")}
                      value={newPass()}
                      onInput={(e) => setNewPass(e.currentTarget.value)}
                    />
                    <input
                      type="password"
                      class={field}
                      placeholder={tx("confirmPassword")}
                      value={confirmPass()}
                      onInput={(e) => setConfirmPass(e.currentTarget.value)}
                    />
                    <Button size="small" variant="primary" disabled={busy()} onClick={() => void onReset()}>
                      {tx("resetPassword")}
                    </Button>
                  </Show>

                  <Show when={tab() === "forgot-success"}>
                    <p class="text-14-medium text-text-strong">{tx("passwordUpdated")}</p>
                    <p class="text-12-regular text-text-weak">{tx("passwordUpdatedHint")}</p>
                    <Button size="small" variant="primary" onClick={() => setTab("signin")}>
                      {tx("backSignIn")}
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
                  <span class="text-11-medium text-text-weak truncate">{tx("selectProduct")}</span>
                  <div class="flex items-center gap-1 shrink-0" data-ead-menu>
                    <Button size="small" variant="secondary" onClick={() => launch({ kind: "dashboard" })}>
                      {tx("aiPilot")}
                    </Button>
                    <div class="relative">
                      <button
                        type="button"
                        class="h-6 w-6 rounded border border-border-weaker-base text-12-regular text-text-weak hover:bg-surface-base-hover"
                        aria-label={tx("menu")}
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
                            onClick={askEdit}
                          >
                            {tx("editProduct")}
                          </button>
                          <button
                            type="button"
                            class={item}
                            onClick={() => {
                              closeMenus()
                              window.open(`${eadServer()}/welcome/profile`, "_blank")
                            }}
                          >
                            {tx("profile")}
                          </button>
                          <button
                            type="button"
                            class={`${item} flex items-center justify-between`}
                            onClick={() => setMenu(menu() === "lang" ? "user" : "lang")}
                          >
                            <span>{tx("language")}</span>
                            <span class="text-11-regular text-text-weak">{lang().toUpperCase()}</span>
                          </button>
                          <Show when={menu() === "lang"}>
                            <For each={["en", "zh", "ja", "ko"] as Lang[]}>
                              {(code) => (
                                <button
                                  type="button"
                                  class={`${item} pl-4 ${ead.language() === code ? itemActive : ""}`}
                                  onClick={() => {
                                    ead.setLanguage(code)
                                    closeMenus()
                                  }}
                                >
                                  {tx(
                                    code === "en"
                                      ? "langEn"
                                      : code === "zh"
                                        ? "langZh"
                                        : code === "ja"
                                          ? "langJa"
                                          : "langKo",
                                  )}
                                </button>
                              )}
                            </For>
                          </Show>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <button type="button" class={`${item} text-text-weak`} onClick={onSignOut}>
                            {tx("logout")}
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
                        {ead.productName() || tx("selectProductHint")}
                      </span>
                      <span class="shrink-0 text-text-weak">▾</span>
                    </button>
                    <Show when={menu() === "product"}>
                      <div class={`${drop} left-0 right-0 w-auto max-w-none`}>
                        <div class="px-2 pb-1.5 border-b border-border-weaker-base">
                          <input
                            class={`${field} py-1`}
                            placeholder={tx("searchProduct")}
                            value={pq()}
                            onInput={(e) => setPq(e.currentTarget.value)}
                            autofocus
                          />
                        </div>
                        <div class="max-h-56 overflow-y-auto">
                          <Show
                            when={grouped().length}
                            fallback={
                              <For each={filtered()} fallback={<div class="px-2.5 py-2 text-text-weak">{tx("noProducts")}</div>}>
                                {(p) => (
                                  <Choice
                                    product={p}
                                    active={ead.productId() === p.productId}
                                    lang={lang()}
                                    onPick={pickProduct}
                                  />
                                )}
                              </For>
                            }
                          >
                            <For each={grouped()}>
                              {(g) => (
                                <div>
                                  <div class="px-2.5 py-1 text-11-regular text-text-weak truncate">
                                    {g.name || tx("teamFallback")}
                                  </div>
                                  <For each={g.products}>
                                    {(p) => (
                                      <Choice
                                        product={p}
                                        active={ead.productId() === p.productId}
                                        lang={lang()}
                                        onPick={pickProduct}
                                      />
                                    )}
                                  </For>
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>
                      </div>
                    </Show>
                  </div>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={ead.productId() <= 0}
                    onClick={askEdit}
                    title={tx("editProduct")}
                  >
                    ✎
                  </Button>
                </div>

                <Show when={hint() && ead.productId() <= 0}>
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-weaker-base bg-surface-base text-12-regular">
                    <span class="min-w-0 flex-1 truncate text-text-weak">
                      {tx("suggested")} <span class="text-text-strong">{hint()!.name}</span>
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
                      {tx("use")}
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => setHint(undefined)}>
                      {tx("dismiss")}
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
                      <span class="shrink-0 text-text-weak">{tx("pfmPrefix")}</span>
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
                        {tx("siblingPfm")}
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
                          {tx("baseMap")}
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
                        <div class="my-1 border-t border-border-weaker-base" />
                        <button
                          type="button"
                          class={`${item} text-text-weak`}
                          onClick={() => openHelp("pfm-schema-filter")}
                        >
                          {tx("help")}
                        </button>
                      </div>
                    </Show>
                  </div>
                </Show>

                <div class="flex items-center gap-1" data-ead-menu>
                  <input
                    class={`${field} flex-1 py-1`}
                    placeholder={ead.view() === "source" ? tx("searchSource") : tx("searchPfm")}
                    value={query()}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                  <div class="relative shrink-0">
                    <button
                      type="button"
                      class="h-7 w-7 rounded border border-border-weaker-base text-12-regular text-text-weak hover:bg-surface-base-hover"
                      classList={{ "border-border-weak-base bg-surface-base-active": pfmFilter().active }}
                      aria-label={tx("setup")}
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
                          {tx("viewSetup")}
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
                          {tx("setupFilter")}
                        </button>
                        <button
                          type="button"
                          class={item}
                          disabled={ead.productId() <= 0}
                          onClick={() => {
                            closeMenus()
                            launch({ kind: "crawl" })
                          }}
                          title={tx("crawlVisionHint")}
                        >
                          {tx("crawlVision")}
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
                          {tx("enableOwner")}
                        </label>
                        <button
                          type="button"
                          class={`${item} flex items-center justify-between`}
                          onClick={() => {
                            setDiag((v) => !v)
                            closeMenus()
                          }}
                        >
                          <span>{tx("showDebug")}</span>
                          <span class="text-11-regular text-text-weak">{diag() ? tx("on") : tx("off")}</span>
                        </button>
                        <div class="my-1 border-t border-border-weaker-base" />
                        <button
                          type="button"
                          class={`${item} text-text-weak`}
                          onClick={() => openHelp("ead-map-search-setup")}
                        >
                          {tx("help")}
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>

                <Show when={pfmFilter().ids.length > 0}>
                  <div class="flex items-center gap-2 text-11-regular text-text-weak">
                    <span>{tx("pfmFilterPrefix", { count: pfmFilter().ids.length })}</span>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded border border-border-weaker-base hover:bg-surface-base-hover"
                      classList={{ "text-text-strong border-border-weak-base": pfmFilter().active }}
                      onClick={() => {
                        const cur = pfmFilter()
                        const pid = ead.productId()
                        const next = !cur.active
                        writePfmFilter(cur.ids, next, cur.paths, pid)
                        bump()
                        if (next && !cur.paths.length) void fillPaths(cur.ids, pid)
                      }}
                    >
                      {pfmFilter().active ? tx("on") : tx("off")}
                    </button>
                  </div>
                </Show>

                <Show when={owner().enabled}>
                  <div class="relative flex items-center gap-1.5 text-11-regular" data-ead-menu>
                    <span class="shrink-0 text-text-weak">{tx("jobOwner")}</span>
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
                            placeholder={tx("searchMembers")}
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
                            {multi() ? tx("multi") : tx("single")}
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
                                {tx("all")}
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
                                  {tx("me")}
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
                              {tx("selectAll")}
                            </button>
                            <div class="flex gap-1">
                              <Button size="small" variant="ghost" onClick={() => closeMenus()}>
                                {tx("cancel")}
                              </Button>
                              <Button size="small" variant="secondary" onClick={applyOwner}>
                                {tx("apply")}
                              </Button>
                            </div>
                          </div>
                          <label class={`${item} flex items-center gap-2 cursor-pointer`}>
                            <input
                              type="checkbox"
                              checked={draftMe()}
                              onChange={(e) => setDraftMe(e.currentTarget.checked)}
                            />
                            {tx("includeMe")}
                            {email() ? ` (${email()})` : ""}
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
                        <div class="my-1 border-t border-border-weaker-base" />
                        <button
                          type="button"
                          class={`${item} text-text-weak`}
                          onClick={() => openHelp("job-owner-filter")}
                        >
                          {tx("help")}
                        </button>
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
                    {`${tx("diagTitle")}
env=${ead.env()}
api=${eadApi()}
auth=${ead.token() ? "yes" : "no"}
mcp=${ead.mcpEntry() || "-"}
productId=${ead.productId()}
mapId=${ead.mapId()} schemaId=${ead.schemaId()} subSchemaId=${ead.subSchemaId()}
nodeId=${ead.nodeId()} sourceId=${ead.sourceId()}
view=${ead.view()} badge=${ead.badge()} jobsOnly=${ead.jobsOnly()}
workContextId=${ead.workContextId()}
pfmFilter=${pfmFilter().active ? "on" : "off"} ids=${pfmFilter().ids.length} paths=${pfmFilter().paths.length}
owner=${owner().enabled ? ownerSummary(owner()) : "off"}
err=${err() || "-"}
${pipeline()}`}
                  </pre>
                </Show>

                <div class="tree-toolbar-row flex items-center gap-1 flex-wrap" data-ead-menu>
                  <div class="relative">
                    <button
                      type="button"
                      class="px-2 py-1 rounded border border-border-weaker-base text-11-regular text-text-base hover:bg-surface-base-hover"
                      onClick={() => setMenu(menu() === "view" ? "" : "view")}
                    >
                      {ead.view() === "source" ? tx("aiCode") : tx("pfmTree")} ▾
                    </button>
                    <Show when={menu() === "view"}>
                      <div class={drop}>
                        <button
                          type="button"
                          class={`${item} ${ead.view() === "pfm" ? itemActive : ""}`}
                          onClick={() => void switchView("pfm")}
                        >
                          {tx("pfmTree")}
                        </button>
                        <button
                          type="button"
                          class={`${item} ${ead.view() === "source" ? itemActive : ""}`}
                          onClick={() => void switchView("source")}
                        >
                          {tx("aiCode")}
                        </button>
                        <div class="my-1 border-t border-border-weaker-base" />
                        <button
                          type="button"
                          class={`${item} text-text-weak`}
                          onClick={() => openHelp("navigator-view-mode")}
                        >
                          {tx("help")}
                        </button>
                      </div>
                    </Show>
                  </div>

                  <Show when={ead.view() === "pfm"}>
                    <div class="relative">
                      <button
                        type="button"
                        class="px-2 py-1 rounded border border-border-weaker-base text-11-regular text-text-base hover:bg-surface-base-hover"
                        title={`${ead.badge()} · ${ead.jobsOnly() ? tx("filtered") : tx("all")}`}
                        onClick={() => setMenu(menu() === "job" ? "" : "job")}
                      >
                        {tx("filter")}
                        <Show when={ead.badge() !== "none" || ead.jobsOnly()}>
                          <span class="ml-1 text-text-weak">
                            · {ead.badge() === "none" ? tx("none") : ead.badge()}
                            {ead.jobsOnly() ? ` · ${tx("filtered")}` : ""}
                          </span>
                        </Show>
                      </button>
                      <Show when={menu() === "job"}>
                        <div class={`${drop} w-44`}>
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">{tx("badge")}</div>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "ead" ? itemActive : ""}`}
                            onClick={() => toggleBadge("ead")}
                          >
                            {tx("ead")}
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "jobs" ? itemActive : ""}`}
                            onClick={() => toggleBadge("jobs")}
                          >
                            {tx("jobs")}
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "tests" ? itemActive : ""}`}
                            onClick={() => toggleBadge("tests")}
                          >
                            {tx("tests")}
                          </button>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">{tx("filter")}</div>
                          <button
                            type="button"
                            class={`${item} ${!ead.jobsOnly() ? itemActive : ""}`}
                            onClick={() => {
                              ead.setJobsOnly(false)
                              setMenu("")
                            }}
                          >
                            {tx("all")}
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.jobsOnly() ? itemActive : ""}`}
                            onClick={() => {
                              ead.setJobsOnly(true)
                              setMenu("")
                            }}
                          >
                            {tx("filtered")}
                          </button>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <button
                            type="button"
                            class={`${item} text-text-weak`}
                            onClick={() => openHelp("pfm-tree-filter")}
                          >
                            {tx("help")}
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
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">{tx("sourceTree")}</div>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "ead" ? itemActive : ""}`}
                            onClick={() => toggleBadge("ead")}
                          >
                            {tx("ead")}
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "jobs" ? itemActive : ""}`}
                            onClick={() => toggleBadge("jobs")}
                          >
                            {tx("jobs")}
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.badge() === "tests" ? itemActive : ""}`}
                            onClick={() => toggleBadge("tests")}
                          >
                            {tx("tests")}
                          </button>
                          <div class="my-1 border-t border-border-weaker-base" />
                          <div class="px-2.5 py-1 text-11-regular text-text-weak">{tx("sourceTree")}</div>
                          <button
                            type="button"
                            class={`${item} ${!ead.eadsOnly() ? itemActive : ""}`}
                            onClick={() => {
                              ead.setEadsOnly(false)
                              persistRun()
                            }}
                          >
                            {tx("showAll")}
                          </button>
                          <button
                            type="button"
                            class={`${item} ${ead.eadsOnly() ? itemActive : ""}`}
                            onClick={() => {
                              ead.setEadsOnly(true)
                              persistRun()
                            }}
                          >
                            {tx("withEads")}
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
                            {tx("setupSource")}
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
                            {tx("aiFind")}
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
                            {tx("analyze")}
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
                      onClick={() => {
                        ead.setEadsOnly(false)
                        persistRun()
                      }}
                    >
                      {tx("showAllSource")}
                    </button>
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded text-11-regular border border-border-weaker-base"
                      classList={{ "bg-surface-base-active text-text-strong": ead.eadsOnly() }}
                      onClick={() => {
                        ead.setEadsOnly(true)
                        persistRun()
                      }}
                    >
                      {tx("showWithEads")}
                    </button>
                  </div>
                </Show>

                <Show when={busy() && !banner()}>
                  <span class="text-12-regular text-text-weak">{tx("loading")}</span>
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
                        pulse={pulse()}
                        lang={lang()}
                        expanded={pfmExpandedIds()}
                        onToggle={onPfmToggle}
                        onChip={setChip}
                        onInject={(kind, node) => void inject(kind, node.nodeId, node.name, "pfm")}
                      />
                    </div>
                  </Show>
                  <Show when={!busy() && ead.productId() > 0 && !root()}>
                    <span class="text-12-regular text-text-weak">{tx("noMap")}</span>
                  </Show>
                  <Show
                    when={
                      !busy() &&
                      !!root() &&
                      pfmVisible().length === 0 &&
                      !query().trim() &&
                      !ead.jobsOnly() &&
                      !pfmFilter().active &&
                      schemas().length > 0
                    }
                  >
                    <div class="flex flex-col gap-2">
                      <span class="text-12-regular text-text-weak">{tx("emptyDynamic")}</span>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => launch({ kind: "crawl" })}
                        title={tx("crawlVisionHint")}
                      >
                        {tx("crawlVision")}
                      </Button>
                    </div>
                  </Show>
                  <Show when={!busy() && root() && pfmVisible().length === 0 && (query().trim() || ead.jobsOnly() || pfmFilter().active)}>
                    <span class="text-12-regular text-text-weak">{tx("noMatch")}</span>
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
                        pulse={pulse()}
                        lang={lang()}
                        onChip={setChip}
                        onInject={(kind, node) => void inject(kind, node.nodeId, node.nodeName, "source")}
                      />
                    </div>
                  </Show>
                  <Show when={!busy() && ead.productId() > 0 && source().length === 0}>
                    <div class="flex flex-col gap-2">
                      <span class="text-12-regular text-text-weak">{tx("noSource")}</span>
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
                        {tx("syncSource")}
                      </Button>
                    </div>
                  </Show>
                  <Show when={!busy() && source().length > 0 && sourceVisible().length === 0 && (query().trim() || ead.eadsOnly() || pfmFilter().active)}>
                    <span class="text-12-regular text-text-weak">{tx("noMatchSource")}</span>
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
