import { createEffect, createResource, createSignal, For, on, Show, type JSX } from "solid-js"
import { Avatar } from "@opencode-ai/ui/avatar"
import { Icon } from "@opencode-ai/ui/icon"
import { Popover } from "@opencode-ai/ui/popover"
import { getAvatarColors } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useCowork, type CoworkEntry } from "@/context/cowork"
import { workspaceKey } from "@/pages/layout/helpers"

const LIMIT = 10
/** A search box appears once the person has more projects than this. */
const SEARCH = 5

/**
 * The person's most recently active projects (up to ten, newest first), with a search box when they
 * have more than five. Used by the title-bar project switcher and the related-project picker.
 */
export function RecentProjectPicker(props: {
  trigger: JSX.Element
  triggerProps?: Record<string, unknown>
  title: string
  /** The open project's folder: always listed, with a check mark. */
  current?: string
  /** Leaves these folders out (the current project and those already related). */
  exclude?: string[]
  /**
   * The choice is saved in EAD Pilot (related projects): only Pilot projects can be picked, and while
   * Pilot cannot save it, the list still shows the projects with `note` explaining why.
   */
  pilot?: boolean
  note?: string
  /** Leaves these Pilot projects out of the list. */
  skip?: number[]
  empty?: string
  placement?: "bottom-start" | "bottom-end"
  onPick: (item: CoworkEntry) => void
  /** Allows projects that are not on this computer (they have no folder here). */
  remote?: boolean
  footer?: (close: () => void) => JSX.Element
}) {
  const language = useLanguage()
  const cowork = useCowork()
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [text, setText] = createSignal("")
  let timer: ReturnType<typeof setTimeout> | undefined

  createEffect(
    on(open, (value) => {
      if (value) return
      setQuery("")
      setText("")
    }),
  )

  const [items] = createResource(
    () => (open() ? { query: query(), skip: props.skip ?? [] } : undefined),
    (input) =>
      cowork
        .recent({ limit: LIMIT + (props.exclude?.length ?? 0), q: input.query, skip: input.skip, current: props.current })
        .then((list) => list.filter((item) => !hidden(item)).slice(0, LIMIT)),
  )
  // Whether to offer search is decided by the unfiltered list, so it stays while typing.
  const [total] = createResource(
    () => (open() ? { skip: props.skip ?? [] } : undefined),
    (input) =>
      cowork
        .recent({ limit: SEARCH + 1 + (props.exclude?.length ?? 0), skip: input.skip, current: props.current })
        .then((list) => list.filter((item) => !hidden(item)).length),
  )

  const type = (value: string) => {
    setText(value)
    clearTimeout(timer)
    timer = setTimeout(() => setQuery(value.trim()), 150)
  }
  const close = () => setOpen(false)
  const hidden = (item: CoworkEntry) =>
    !!item.worktree && !!props.exclude?.some((dir) => workspaceKey(dir) === workspaceKey(item.worktree!))
  const usable = (item: CoworkEntry) => (props.pilot ? !!item.projectId : true) && (!!item.worktree || !!props.remote)
  const pick = (item: CoworkEntry) => {
    if (!usable(item)) return
    close()
    props.onPick(item)
  }

  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement={props.placement ?? "bottom-start"}
      triggerAs="button"
      triggerProps={{ type: "button", ...props.triggerProps }}
      trigger={props.trigger}
      class="recent-project-picker !max-w-[340px] w-[300px] [&_[data-slot=popover-body]]:p-1"
    >
      <div class="flex flex-col gap-1">
        <div class="px-2 pt-1 text-12-regular text-text-weak">{props.title}</div>
        <Show when={props.note}>
          <div data-action="recent-project-note" class="mx-1 px-2 py-1.5 rounded-md bg-surface-base text-12-regular text-text-base">
            {props.note}
          </div>
        </Show>
        <Show when={(total() ?? 0) > SEARCH}>
          <div class="mx-1 flex items-center gap-2 h-8 px-2 rounded-md bg-surface-base border border-border-weak-base focus-within:border-border-interactive-base">
            <Icon name="magnifying-glass" size="small" class="text-icon-weak shrink-0" />
            <input
              type="text"
              data-action="recent-project-search"
              value={text()}
              ref={(el) => setTimeout(() => el.focus(), 0)}
              onInput={(event) => type(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                const first = items()?.find(usable)
                if (first) pick(first)
              }}
              placeholder={language.t("rail.project.search")}
              aria-label={language.t("rail.project.search")}
              class="flex-1 min-w-0 bg-transparent text-12-regular text-text-strong placeholder:text-text-weak outline-none"
            />
          </div>
        </Show>
        <div class="max-h-80 overflow-y-auto flex flex-col" role="listbox">
          <Show
            when={(items() ?? []).length > 0}
            fallback={
              <div class="px-2 py-1.5 text-12-regular text-text-weak">
                {items.loading ? "…" : (props.empty ?? language.t("rail.project.none"))}
              </div>
            }
          >
            <For each={items()}>
              {(item) => (
                <button
                  type="button"
                  role="option"
                  data-action="recent-project-option"
                  class="w-full min-w-0 px-2 py-1.5 rounded-md flex items-center gap-2 text-left hover:bg-surface-raised-base-hover focus-visible:bg-surface-raised-base-hover outline-none disabled:opacity-50 disabled:hover:bg-transparent"
                  title={item.worktree ?? item.repo}
                  disabled={!usable(item)}
                  onClick={() => pick(item)}
                >
                  <Avatar
                    fallback={item.name}
                    size="small"
                    class="size-5 shrink-0 rounded"
                    {...getAvatarColors()}
                  />
                  <div class="flex-1 min-w-0 flex flex-col">
                    <span class="truncate text-13-regular text-text-strong">{item.name}</span>
                    <span class="truncate text-11-regular text-text-weak">
                      {item.worktree ?? `${item.repo} · ${language.t("cowork.picker.elsewhere")}`}
                    </span>
                  </div>
                  <Show when={!!props.current && !!item.worktree && workspaceKey(props.current) === workspaceKey(item.worktree)}>
                    <Icon name="check-small" size="small" class="shrink-0" />
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </div>
        <Show when={props.footer}>{(footer) => footer()(close)}</Show>
      </div>
    </Popover>
  )
}
