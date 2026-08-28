import { Show, createMemo } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import type { PluginPanelEntry, PluginPanelProps } from "@/context/plugin-registry"
import { RESIZE_MIN, resizeMax, type Sizing } from "@/pages/session/helpers"

export type { PluginPanelProps }

export function PluginPanel(props: {
  panel: PluginPanelEntry
  sessionKey: () => string
  sizing: Sizing
}) {
  const layout = useLayout()
  const language = useLanguage()
  const isDesktop = createMediaQuery("(min-width: 768px)")

  const opened = layout.pluginPanel.opened(props.panel.id)
  const width = layout.pluginPanel.width(props.panel.id)

  const panelOpen = createMemo(() => isDesktop() && opened())
  const panelWidth = createMemo(() => (panelOpen() ? `${width()}px` : "0px"))

  return (
    <Show when={isDesktop()}>
      <aside
        aria-label={props.panel.title}
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
            <span class="text-14-medium text-text-strong">{props.panel.title}</span>
            <IconButton
              icon="close-small"
              variant="ghost"
              class="h-5 w-5"
              onClick={() => layout.pluginPanel.close(props.panel.id)}
              aria-label={language.t("common.close")}
            />
          </div>
          <div class="flex-1 min-h-0 overflow-hidden">
            <props.panel.component sessionKey={props.sessionKey} width={width} />
          </div>
        </div>
        <Show when={panelOpen()}>
          <ResizeHandle
            direction="horizontal"
            edge="start"
            size={width()}
            min={RESIZE_MIN}
            max={resizeMax()}
            onDragStart={() => props.sizing.begin()}
            onDragEnd={() => props.sizing.end()}
            onResize={(w) => {
              layout.pluginPanel.resize(props.panel.id, w)
            }}
          />
        </Show>
      </aside>
    </Show>
  )
}
