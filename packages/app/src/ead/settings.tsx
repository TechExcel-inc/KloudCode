import { createSimpleContext } from "@opencode-ai/ui/context"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { persisted } from "@/utils/persist"
import { bindEadHttp } from "./http"
import { DEFAULT_MCP_ENTRY } from "./mcp"

type State = {
  token: string
  productId: number
  productName: string
  nodeId: number
  nodeName: string
  mapId: number
  language: "en" | "zh"
  mcpEntry: string
  pilotBust: number
}

const empty: State = {
  token: "",
  productId: 0,
  productName: "",
  nodeId: 0,
  nodeName: "",
  mapId: 0,
  language: "zh",
  mcpEntry: DEFAULT_MCP_ENTRY,
  pilotBust: 0,
}

export const { use: useEad, provider: EadProvider } = createSimpleContext({
  name: "Ead",
  init: () => {
    bindEadHttp(usePlatform())
    const [store, setStore, , ready] = persisted("ead.v1", createStore<State>({ ...empty }))

    return {
      ready,
      token: () => store.token ?? "",
      productId: () => store.productId ?? 0,
      productName: () => store.productName ?? "",
      nodeId: () => store.nodeId ?? 0,
      nodeName: () => store.nodeName ?? "",
      mapId: () => store.mapId ?? 0,
      language: () => (store.language === "en" ? "en" : "zh"),
      mcpEntry: () => (store.mcpEntry?.trim() ? store.mcpEntry.trim() : DEFAULT_MCP_ENTRY),
      pilotBust: () => store.pilotBust ?? 0,
      setToken(token: string) {
        setStore("token", token.trim())
      },
      clearToken() {
        setStore("token", "")
      },
      setProduct(id: number, name: string) {
        setStore("productId", id)
        setStore("productName", name)
        setStore("nodeId", 0)
        setStore("nodeName", "")
        setStore("mapId", 0)
      },
      setNode(id: number, name: string) {
        setStore("nodeId", id)
        setStore("nodeName", name)
      },
      setMapId(id: number) {
        setStore("mapId", id)
      },
      setLanguage(language: "en" | "zh") {
        setStore("language", language)
      },
      setMcpEntry(path: string) {
        setStore("mcpEntry", path.trim() || DEFAULT_MCP_ENTRY)
      },
      bumpPilot() {
        setStore("pilotBust", (n) => (n ?? 0) + 1)
      },
    }
  },
})
