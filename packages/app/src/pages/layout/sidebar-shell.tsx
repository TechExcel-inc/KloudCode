import { createEffect, createMemo, Index, type Accessor, type JSX } from "solid-js"
import { type IconProps } from "@opencode-ai/ui/icon"
import { RailItem } from "./sidebar-rail"

export type RailEntry = {
  id: string
  icon: IconProps["name"]
  label: string
  active: boolean
  onClick: () => void
}

export const SidebarContent = (props: {
  mobile?: boolean
  opened: Accessor<boolean>
  aimMove: (event: MouseEvent) => void
  items: Accessor<RailEntry[]>
  footer: () => JSX.Element
  renderPanel: () => JSX.Element
}): JSX.Element => {
  const expanded = createMemo(() => !!props.mobile || props.opened())
  let panel: HTMLDivElement | undefined

  createEffect(() => {
    const el = panel
    if (!el) return
    if (expanded()) {
      el.removeAttribute("inert")
      return
    }
    el.setAttribute("inert", "")
  })

  return (
    <div class="flex h-full w-full min-w-0 overflow-hidden">
      <div
        data-component="sidebar-rail"
        class="w-16 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
        onMouseMove={props.aimMove}
      >
        <div class="flex-1 min-h-0 w-full flex flex-col items-center gap-1 px-2 py-3 overflow-y-auto no-scrollbar">
          <Index each={props.items()}>
            {(item) => (
              <RailItem
                icon={item().icon}
                label={item().label}
                active={item().active}
                mobile={props.mobile}
                onClick={() => item().onClick()}
              />
            )}
          </Index>
        </div>
        <div class="shrink-0 w-full pt-3 pb-5 flex flex-col items-center gap-2">{props.footer()}</div>
      </div>

      <div
        ref={(el) => {
          panel = el
        }}
        classList={{ "flex-1 flex h-full min-h-0 min-w-0 overflow-hidden": true, "pointer-events-none": !expanded() }}
        aria-hidden={!expanded()}
      >
        {props.renderPanel()}
      </div>
    </div>
  )
}
