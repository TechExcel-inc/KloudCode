import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { showToast } from "@opencode-ai/ui/toast"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import type { Sizing } from "@/pages/session/helpers"
import { loadActiveMap, loadProducts, login, me, type PfmNode, type Product } from "@/ead/api"
import { ensureEadMcp } from "@/ead/ensure-mcp"
import { useEad } from "@/ead/settings"
import { EAD_MAP_ID, EAD_MAP_MAX, EAD_MAP_MIN, EAD_MAP_WIDTH, EAD_PILOT_ID, EAD_PILOT_WIDTH } from "@/ead/urls"

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

export function EadMapPanel(props: { sizing: Sizing }) {
  const layout = useLayout()
  const language = useLanguage()
  const platform = usePlatform()
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
  const [busy, setBusy] = createSignal(false)
  const [err, setErr] = createSignal("")
  const [user, setUser] = createSignal("")
  const [id, setId] = createSignal("")
  const [pass, setPass] = createSignal("")

  const refresh = async () => {
    const token = ead.token()
    if (!token) {
      setProducts([])
      setRoot(undefined)
      setUser("")
      return
    }
    setBusy(true)
    setErr("")
    try {
      const fetcher = http()
      const profile = await me(token, fetcher).catch(() => undefined)
      setUser(String(profile?.name || profile?.userName || profile?.email || "signed in"))
      const list = await loadProducts(token, fetcher)
      setProducts(list)
      const pid = ead.productId()
      const selected = pid > 0 ? list.find((p) => p.productId === pid) : undefined
      if (!selected) {
        setRoot(undefined)
        return
      }
      const map = await loadActiveMap(token, selected.productId, fetcher)
      ead.setMapId(map.mapId)
      setRoot(map.root)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setRoot(undefined)
    } finally {
      setBusy(false)
    }
  }

  createEffect(() => {
    if (!panelOpen()) return
    void refresh()
  })

  const onLogin = async () => {
    setBusy(true)
    setErr("")
    try {
      const token = await login(id(), pass(), http())
      ead.setToken(token)
      setPass("")
      await refresh()
      await ensureEadMcp({
        client: sdk.client,
        token,
        entry: ead.mcpEntry(),
      }).catch((e) => {
        showToast({
          title: "MCP",
          description: e instanceof Error ? e.message : String(e),
          variant: "error",
        })
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openPilot = () => {
    ead.bumpPilot()
    layout.pluginPanel.open(EAD_PILOT_ID, EAD_PILOT_WIDTH)
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
        <div class="size-full flex flex-col border-r border-border-weaker-base">
          <div class="shrink-0 px-3 py-2 flex items-center justify-between border-b border-border-weaker-base gap-2">
            <span class="text-14-medium text-text-strong truncate">EAD Map</span>
            <div class="flex items-center gap-1">
              <select
                class="h-6 text-11-regular rounded border border-border-weaker-base bg-background-base px-1"
                value={ead.language()}
                onChange={(e) => ead.setLanguage(e.currentTarget.value === "en" ? "en" : "zh")}
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
                  <p class="text-12-regular text-text-weak">Sign in to EAD PFM (eadfm.com)</p>
                  <input
                    class="w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"
                    placeholder="Email / phone / login"
                    value={id()}
                    onInput={(e) => setId(e.currentTarget.value)}
                  />
                  <input
                    type="password"
                    class="w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"
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
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-12-regular text-text-weak truncate">{user() || "Signed in"}</span>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => {
                      ead.clearToken()
                      setProducts([])
                      setRoot(undefined)
                      setUser("")
                    }}
                  >
                    Sign out
                  </Button>
                </div>

                <label class="text-12-medium text-text-weak">Product</label>
                <select
                  class="w-full px-2 py-1.5 text-12-regular rounded-md border border-border-weak-base bg-background-base"
                  value={ead.productId() || ""}
                  onChange={(e) => {
                    const next = Number(e.currentTarget.value)
                    const product = products().find((p) => p.productId === next)
                    if (!product) return
                    ead.setProduct(product.productId, product.name)
                    void refresh()
                  }}
                >
                  <option value="">Select product…</option>
                  <For each={products()}>{(p) => <option value={p.productId}>{p.name}</option>}</For>
                </select>

                <Show when={busy()}>
                  <span class="text-12-regular text-text-weak">Loading…</span>
                </Show>

                <Show when={root()}>
                  {(node) => (
                    <div class="flex flex-col gap-1 border border-border-weaker-base rounded-md py-1 max-h-[50vh] overflow-y-auto">
                      <Tree
                        nodes={[node()]}
                        selected={ead.nodeId()}
                        onSelect={(n) => {
                          ead.setNode(n.nodeId, n.name)
                          if (layout.pluginPanel.opened(EAD_PILOT_ID)()) ead.bumpPilot()
                        }}
                      />
                    </div>
                  )}
                </Show>

                <Show when={!busy() && ead.productId() > 0 && !root()}>
                  <span class="text-12-regular text-text-weak">No active PFM map for this product.</span>
                </Show>

                <Show when={ead.nodeId() > 0}>
                  <span class="text-11-regular text-text-weak truncate">Selected: {ead.nodeName()}</span>
                </Show>

                <Button size="small" variant="primary" onClick={openPilot}>
                  AI Pilot / AI 领航
                </Button>
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
