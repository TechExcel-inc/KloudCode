import { createSimpleContext } from "@opencode-ai/ui/context"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { persisted } from "@/utils/persist"
import { bindEadHttp } from "./http"
import { DEFAULT_MCP_ENTRY } from "./mcp"

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
  language: "en" | "zh"
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
}

export const { use: useEad, provider: EadProvider } = createSimpleContext({
  name: "Ead",
  init: () => {
    bindEadHttp(usePlatform())
    const [store, setStore, , ready] = persisted("ead.v1", createStore<State>({ ...empty }))

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
      language: () => (store.language === "en" ? "en" : "zh"),
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
      setLanguage(language: "en" | "zh") {
        setStore("language", language)
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
