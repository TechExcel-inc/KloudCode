import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import type { Sizing } from "@/pages/session/helpers"
import {
  buildPilotUrl,
  handlePluginMessage,
  isEadOrigin,
  openPilotDashboard,
  pingHost,
  setUiLanguage,
  syncAuth,
} from "@/ead/bridge"
import { useEad } from "@/ead/settings"
import { EAD_PILOT_ID, EAD_PILOT_MAX, EAD_PILOT_MIN, EAD_PILOT_WIDTH } from "@/ead/urls"

export function EadPilotPanel(props: { sizing: Sizing }) {
  const layout = useLayout()
  const language = useLanguage()
  const ead = useEad()
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const [frame, setFrame] = createSignal<HTMLIFrameElement>()

  const opened = layout.pluginPanel.opened(EAD_PILOT_ID)
  const width = layout.pluginPanel.width(EAD_PILOT_ID)
  const panelOpen = createMemo(() => isDesktop() && opened())
  const panelWidth = createMemo(() => (panelOpen() ? `${width()}px` : "0px"))

  const src = createMemo(() =>
    buildPilotUrl({
      productId: ead.productId(),
      productName: ead.productName(),
      nodeId: ead.nodeId(),
      nodeName: ead.nodeName(),
      mapId: ead.mapId(),
      openAiPilot: true,
      language: ead.language(),
      bust: ead.pilotBust(),
    }),
  )

  const push = (el: HTMLIFrameElement | undefined) => {
    if (!el) return
    syncAuth(el, ead.token())
    setUiLanguage(el, ead.language())
    openPilotDashboard(el, {
      productId: ead.productId() || undefined,
      productName: ead.productName() || undefined,
    })
    pingHost(el)
  }

  createEffect(() => {
    if (!panelOpen()) return
    const el = frame()
    const token = ead.token()
    const lang = ead.language()
    const bust = ead.pilotBust()
    void token
    void lang
    void bust
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(() => push(el), ms))
    onCleanup(() => timers.forEach((t) => window.clearTimeout(t)))
  })

  createEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isEadOrigin(event.origin)) return
      const data = event.data
      if (!data || typeof data !== "object") return
      handlePluginMessage(data as Record<string, unknown>, {
        setToken: (token) => ead.setToken(token),
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
        <div class="size-full flex flex-col border-l border-border-weaker-base">
          <div class="shrink-0 px-3 py-2 flex items-center justify-between border-b border-border-weaker-base">
            <span class="text-14-medium text-text-strong">EAD Pilot</span>
            <IconButton
              icon="close-small"
              variant="ghost"
              class="h-5 w-5"
              onClick={() => layout.pluginPanel.close(EAD_PILOT_ID)}
              aria-label={language.t("common.close")}
            />
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
              edge="start"
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

export function openEadPilot(layout: ReturnType<typeof useLayout>) {
  layout.pluginPanel.open(EAD_PILOT_ID, EAD_PILOT_WIDTH)
}
