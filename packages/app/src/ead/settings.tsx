import { createSimpleContext } from "@opencode-ai/ui/context"
import { createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { persisted } from "@/utils/persist"
import { bindFilters, emptyOwner, mergeOwner, mergePfm, type OwnerFilter, type PfmFilter } from "./filters"
import { bindEadHttp } from "./http"
import type { Lang } from "./i18n"
import { DEFAULT_MCP_ENTRY } from "./mcp"
import { applyEnv, type Env } from "./urls"

type View = "pfm" | "source"
type Mode = "opencode" | "cursor"
type Badge = "ead" | "jobs" | "tests" | "none"

type State = {
  token: string
  productId: number
  productName: string
  nodeId: number
  nodeName: string
  mapId: number
  schemaId: number
  schemaName: string
  subSchemaId: number
  sourceId: number
  sourceName: string
  sourcePath: string
  view: View
  pilotMode: Mode
  language: Lang
  env: Env
  mcpEntry: string
  pilotBust: number
  eadScript: string
  aiPrompt: string
  contextMarkdown: string
  mapTick: number
  eadsOnly: boolean
  badge: Badge
  expanded: Record<string, string[]>
  jobsOnly: boolean
  workContextId: number
  owners: Record<string, OwnerFilter>
  pfm: Record<string, PfmFilter>
}

const empty: State = {
  token: "",
  productId: 0,
  productName: "",
  nodeId: 0,
  nodeName: "",
  mapId: 0,
  schemaId: 0,
  schemaName: "",
  subSchemaId: 0,
  sourceId: 0,
  sourceName: "",
  sourcePath: "",
  view: "pfm",
  pilotMode: "opencode",
  language: "zh",
  env: "production",
  mcpEntry: DEFAULT_MCP_ENTRY,
  pilotBust: 0,
  eadScript: "",
  aiPrompt: "",
  contextMarkdown: "",
  mapTick: 0,
  eadsOnly: true,
  badge: "ead",
  expanded: {},
  jobsOnly: false,
  workContextId: 0,
  owners: {},
  pfm: {},
}

export const { use: useEad, provider: EadProvider } = createSimpleContext({
  name: "Ead",
  init: () => {
    bindEadHttp(usePlatform())
    const [store, setStore, , ready] = persisted("ead.v1", createStore<State>({ ...empty }))

    const flushFilters = () => {
      bindFilters(
        { owners: store.owners ?? {}, pfm: store.pfm ?? {} },
        (next) => {
          setStore("owners", next.owners)
          setStore("pfm", next.pfm)
        },
      )
    }

    createEffect(() => {
      if (!ready()) return
      applyEnv(store.env === "localhost" ? "localhost" : "production")
      flushFilters()
    })

    const clearSession = () => {
      setStore("productId", 0)
      setStore("productName", "")
      setStore("nodeId", 0)
      setStore("nodeName", "")
      setStore("mapId", 0)
      setStore("schemaId", 0)
      setStore("schemaName", "")
      setStore("subSchemaId", 0)
      setStore("sourceId", 0)
      setStore("sourceName", "")
      setStore("sourcePath", "")
      setStore("view", "pfm")
      setStore("eadScript", "")
      setStore("aiPrompt", "")
      setStore("contextMarkdown", "")
    }

    return {
      ready,
      token: () => store.token ?? "",
      productId: () => store.productId ?? 0,
      productName: () => store.productName ?? "",
      nodeId: () => store.nodeId ?? 0,
      nodeName: () => store.nodeName ?? "",
      mapId: () => store.mapId ?? 0,
      schemaId: () => store.schemaId ?? 0,
      schemaName: () => store.schemaName ?? "",
      subSchemaId: () => store.subSchemaId ?? 0,
      sourceId: () => store.sourceId ?? 0,
      sourceName: () => store.sourceName ?? "",
      sourcePath: () => store.sourcePath ?? "",
      view: () => (store.view === "source" ? "source" : "pfm"),
      pilotMode: () => (store.pilotMode === "cursor" ? "cursor" : "opencode"),
      language: (): Lang => {
        const lang = store.language
        if (lang === "en" || lang === "ja" || lang === "ko") return lang
        return "zh"
      },
      env: (): Env => (store.env === "localhost" ? "localhost" : "production"),
      mcpEntry: () => (store.mcpEntry?.trim() ? store.mcpEntry.trim() : DEFAULT_MCP_ENTRY),
      pilotBust: () => store.pilotBust ?? 0,
      eadScript: () => store.eadScript ?? "",
      aiPrompt: () => store.aiPrompt ?? "",
      contextMarkdown: () => store.contextMarkdown ?? "",
      mapTick: () => store.mapTick ?? 0,
      eadsOnly: () => store.eadsOnly !== false,
      badge: () => store.badge ?? "ead",
      expanded: (schemaId: number) => store.expanded?.[String(schemaId)] ?? [],
      jobsOnly: () => store.jobsOnly === true,
      workContextId: () => store.workContextId ?? 0,
      setToken(token: string) {
        setStore("token", token.trim())
      },
      clearToken() {
        setStore("token", "")
        setStore("eadScript", "")
        setStore("aiPrompt", "")
        setStore("contextMarkdown", "")
      },
      signOut() {
        setStore("token", "")
        clearSession()
        setStore("pilotBust", (n) => (n ?? 0) + 1)
      },
      setProduct(id: number, name: string) {
        if (store.productId === id) {
          if (name && store.productName !== name) setStore("productName", name)
          return
        }
        setStore("productId", id)
        setStore("productName", name)
        setStore("nodeId", 0)
        setStore("nodeName", "")
        setStore("mapId", 0)
        setStore("schemaId", 0)
        setStore("schemaName", "")
        setStore("subSchemaId", 0)
        setStore("sourceId", 0)
        setStore("sourceName", "")
        setStore("sourcePath", "")
        setStore("eadScript", "")
        setStore("aiPrompt", "")
        setStore("contextMarkdown", "")
      },
      setNode(id: number, name: string) {
        setStore("nodeId", id)
        setStore("nodeName", name)
        setStore("sourceId", 0)
        setStore("sourceName", "")
        setStore("sourcePath", "")
      },
      setSource(id: number, name: string, path = "") {
        setStore("sourceId", id)
        setStore("sourceName", name)
        setStore("sourcePath", path)
        setStore("nodeId", 0)
        setStore("nodeName", "")
      },
      setSchema(id: number, name: string) {
        setStore("schemaId", id)
        setStore("schemaName", name)
      },
      setSubSchema(id: number) {
        setStore("subSchemaId", id)
      },
      setView(view: View) {
        setStore("view", view)
      },
      setPilotMode(mode: Mode) {
        setStore("pilotMode", mode)
      },
      setEadsOnly(value: boolean) {
        setStore("eadsOnly", value)
      },
      setBadge(badge: Badge) {
        setStore("badge", badge)
      },
      setJobsOnly(value: boolean) {
        setStore("jobsOnly", value)
      },
      setWorkContext(id: number) {
        setStore("workContextId", Number.isFinite(id) && id > 0 ? id : 0)
      },
      setExpanded(schemaId: number, paths: string[]) {
        setStore("expanded", String(schemaId), paths)
      },
      setContext(input: { eadScript?: string; aiPrompt?: string; markdown?: string; nodeName?: string }) {
        // Keep tree selection labels; context payload may carry an EAD entity title.
        void input.nodeName
        setStore("eadScript", input.eadScript ?? "")
        setStore("aiPrompt", input.aiPrompt ?? "")
        setStore("contextMarkdown", input.markdown ?? "")
      },
      clearContext() {
        setStore("eadScript", "")
        setStore("aiPrompt", "")
        setStore("contextMarkdown", "")
      },
      setMapId(id: number) {
        setStore("mapId", id)
      },
      setLanguage(language: Lang) {
        setStore("language", language)
      },
      setEnv(next: Env) {
        const env = next === "localhost" ? "localhost" : "production"
        if (store.env === env) {
          applyEnv(env)
          return
        }
        setStore("env", env)
        applyEnv(env)
        setStore("pilotBust", (n) => (n ?? 0) + 1)
        setStore("mapTick", (n) => (n ?? 0) + 1)
      },
      owner: () => store.owners?.[String(store.productId)] ?? { ...emptyOwner },
      pfmFilter: () => mergePfm(store.pfm?.[String(store.productId)]),
      setOwner(next: Partial<OwnerFilter>) {
        const pid = store.productId
        if (!(pid > 0)) return { ...emptyOwner }
        const merged = mergeOwner(store.owners?.[String(pid)] ?? { ...emptyOwner }, next)
        setStore("owners", String(pid), merged)
        return merged
      },
      setPfmFilter(next: Partial<PfmFilter>) {
        const pid = store.productId
        const prev = mergePfm(pid > 0 ? store.pfm?.[String(pid)] : undefined)
        const merged = mergePfm({
          ids: next.ids ?? prev.ids,
          active: next.active ?? prev.active,
          paths: next.paths ?? prev.paths,
        })
        if (pid > 0) setStore("pfm", String(pid), merged)
        return merged
      },
      setMcpEntry(path: string) {
        setStore("mcpEntry", path.trim())
      },
      bumpPilot() {
        setStore("pilotBust", (n) => (n ?? 0) + 1)
      },
      bumpMap() {
        setStore("mapTick", (n) => (n ?? 0) + 1)
      },
    }
  },
})
