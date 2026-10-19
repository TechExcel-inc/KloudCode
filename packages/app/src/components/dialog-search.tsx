import type { Session } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { getFilename } from "@opencode-ai/util/path"
import { useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useArchive } from "@/context/archive"
import { useCowork } from "@/context/cowork"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { displayName } from "@/pages/layout/helpers"
import { compact, DAY, filter, SHOWS, tokens, type Show as Choice } from "@/utils/archive"
import { sessionTitle } from "@/utils/session-title"

const PAGE = 200

// Token totals need a session's whole transcript, so they load a few at a time and are kept.
const usage = new Map<string, Promise<number | undefined>>()
let running = 0
const waiting: Array<() => void> = []
async function slot<T>(work: () => Promise<T>) {
  if (running >= 3) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  return work().finally(() => {
    running--
    waiting.shift()?.()
  })
}

/**
 * Advanced Search: sessions of the current project and its related projects, filtered by status
 * (open, finished, archived, auto archived), keywords and dates. The current project is always
 * searched; related projects are shared with the project menu's "Also show sessions from".
 */
export function DialogSearch(props: { project?: string }) {
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const archive = useArchive()
  const cowork = useCowork()
  const dialog = useDialog()
  const language = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const [state, setState] = createStore({
    search: "",
    show: [...SHOWS] as Choice[],
    from: "",
    to: "",
    busy: "",
  })
  const [query, setQuery] = createSignal("")
  let timer: ReturnType<typeof setTimeout> | undefined

  const root = () => props.project
  const related = createMemo(() => (root() ? cowork.relatedDirs(root()!) : []))
  // Projects that can be related: every project this app knows, plus the open ones.
  const known = createMemo(() => {
    const dirs = [
      ...layout.projects.list().map((item) => item.worktree),
      ...globalSync.data.project.map((item) => item.worktree),
    ]
    return [...new Set(dirs)].filter((dir) => dir && dir !== root() && !related().includes(dir) && !!cowork.projectOf(dir))
  })
  const label = (dir: string) => {
    const item = layout.projects.list().find((entry) => entry.worktree === dir)
    return item ? displayName(item) : displayName({ worktree: dir })
  }

  // The server narrows by title and last activity; status and projects are filtered here.
  const [list, { mutate }] = createResource(
    () => ({ search: query(), from: state.from, to: state.to }),
    async (input) => {
      const start = input.from ? new Date(`${input.from}T00:00:00`).getTime() : undefined
      const cursor = input.to ? new Date(`${input.to}T00:00:00`).getTime() + DAY : undefined
      const res = await globalSDK.client.experimental.session.list({
        roots: true,
        archived: true,
        search: input.search || undefined,
        start,
        cursor,
        limit: PAGE,
      })
      return (res.data ?? []) as Session[]
    },
  )

  const rows = createMemo(() =>
    filter(list() ?? [], {
      show: state.show,
      search: state.search,
      projects: root() ? [root()!, ...related()] : undefined,
      from: state.from || undefined,
      to: state.to || undefined,
      auto: archive.auto(),
      finished: archive.finished(),
    }),
  )

  const every = () => SHOWS.every((item) => state.show.includes(item))
  const toggle = (item: Choice) =>
    setState("show", (show) => (show.includes(item) ? show.filter((value) => value !== item) : [...show, item]))
  const summary = () => {
    if (every()) return language.t("search.show.all")
    if (state.show.length === 0) return language.t("search.show.none")
    return state.show.map((item) => language.t(`search.show.${item}`)).join(", ")
  }

  const when = (time: number) =>
    DateTime.fromMillis(time).setLocale(language.intl()).toLocaleString(DateTime.DATETIME_SHORT)

  const used = (session: Session) => {
    const hit = usage.get(session.id)
    if (hit) return hit
    const next = slot(() =>
      globalSDK.client.session
        .messages({ directory: session.directory, sessionID: session.id })
        .then((res) => tokens((res.data ?? []).map((item) => item.info))),
    ).catch(() => undefined)
    usage.set(session.id, next)
    return next
  }

  const act = async (session: Session) => {
    setState("busy", session.id)
    const archived = !!session.time.archived
    const ok = await (archived ? archive.restore(session) : archive.archive(session))
      .then(() => true)
      .catch((err: unknown) => {
        showToast({ title: language.t("common.requestFailed"), description: err instanceof Error ? err.message : "" })
        return false
      })
    setState("busy", "")
    if (!ok) return
    mutate((items) =>
      items?.map((item) =>
        item.id === session.id
          ? { ...item, time: { ...item.time, archived: archived ? undefined : Date.now() } }
          : item,
      ),
    )
  }

  const open = (session: Session) => {
    dialog.close()
    navigate(`/${base64Encode(session.directory)}/session/${session.id}`)
  }

  const chip = "flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-border-weak-base text-12-medium"

  return (
    <Dialog title={language.t("search.title")} size="x-large">
      <div class="flex flex-col gap-3 px-6 pb-5 min-h-0" data-component="session-search">
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-2 h-8 px-2 min-w-56 flex-1 rounded-md bg-surface-base border border-border-weak-base focus-within:border-border-interactive-base">
            <Icon name="magnifying-glass" size="small" class="text-icon-weak shrink-0" />
            <input
              type="text"
              data-action="search-keywords"
              value={state.search}
              placeholder={language.t("search.keywords")}
              aria-label={language.t("search.keywords")}
              class="flex-1 min-w-0 bg-transparent text-13-regular text-text-strong placeholder:text-text-weak outline-none"
              onInput={(event) => {
                const value = event.currentTarget.value
                setState("search", value)
                clearTimeout(timer)
                timer = setTimeout(() => setQuery(value.trim()), 300)
              }}
            />
          </div>
          <DropdownMenu placement="bottom-start">
            <DropdownMenu.Trigger
              as={Button}
              type="button"
              variant="ghost"
              size="small"
              data-action="search-show"
              class="h-8 max-w-72 min-w-0 rounded-md border border-border-weak-base shadow-none"
            >
              <span class="text-12-regular text-text-weak shrink-0">{language.t("search.show")}</span>
              <span class="min-w-0 truncate text-12-medium text-text-strong">{summary()}</span>
              <Icon name="chevron-down" size="small" class="shrink-0 text-icon-weak" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="mt-1 min-w-48">
                <DropdownMenu.Item
                  data-action="search-show-all"
                  closeOnSelect={false}
                  onSelect={() => setState("show", every() ? [] : [...SHOWS])}
                >
                  <Tick on={every()} />
                  <DropdownMenu.ItemLabel>{language.t("search.show.all")}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <For each={SHOWS}>
                  {(item) => (
                    <DropdownMenu.Item
                      data-action={`search-show-${item}`}
                      closeOnSelect={false}
                      onSelect={() => toggle(item)}
                    >
                      <Tick on={state.show.includes(item)} />
                      <DropdownMenu.ItemLabel>{language.t(`search.show.${item}`)}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  )}
                </For>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
          <label class="flex items-center gap-1.5 text-12-regular text-text-weak">
            {language.t("archive.from")}
            <input
              type="date"
              data-action="search-from"
              value={state.from}
              max={state.to || undefined}
              class="h-8 px-2 rounded-md bg-surface-base border border-border-weak-base text-12-regular text-text-strong"
              onChange={(event) => setState("from", event.currentTarget.value)}
            />
          </label>
          <label class="flex items-center gap-1.5 text-12-regular text-text-weak">
            {language.t("archive.to")}
            <input
              type="date"
              data-action="search-to"
              value={state.to}
              min={state.from || undefined}
              class="h-8 px-2 rounded-md bg-surface-base border border-border-weak-base text-12-regular text-text-strong"
              onChange={(event) => setState("to", event.currentTarget.value)}
            />
          </label>
        </div>

        <Show when={root()}>
          {(dir) => (
            <div class="flex flex-wrap items-center gap-2" data-component="search-related">
              <span class="text-12-regular text-text-weak">{language.t("search.related")}</span>
              <span
                class={`${chip} pr-2.5 bg-surface-base-active text-text-strong`}
                data-action="search-related-current"
              >
                {label(dir())}
                <span class="text-11-regular text-text-weak">{language.t("search.related.current")}</span>
              </span>
              <For each={related()}>
                {(item) => (
                  <span class={`${chip} text-text-strong`} data-action="search-related-item">
                    {label(item)}
                    <IconButton
                      icon="close-small"
                      variant="ghost"
                      class="size-5"
                      data-action="search-related-remove"
                      aria-label={language.t("search.related.remove", { project: label(item) })}
                      onClick={() => void cowork.unrelate(dir(), item)}
                    />
                  </span>
                )}
              </For>
              <DropdownMenu placement="bottom-start">
                <DropdownMenu.Trigger
                  as={Button}
                  type="button"
                  variant="ghost"
                  size="small"
                  icon="plus-small"
                  data-action="search-related-add"
                  class="h-7 rounded-full shadow-none"
                >
                  {language.t("search.related.add")}
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="mt-1 min-w-56 max-h-72 overflow-y-auto">
                    <Show
                      when={known().length > 0}
                      fallback={
                        <div class="px-2 py-1.5 text-12-regular text-text-weak">
                          {language.t("search.related.none")}
                        </div>
                      }
                    >
                      <For each={known()}>
                        {(item) => (
                          <DropdownMenu.Item
                            data-action="search-related-option"
                            onSelect={() => void cowork.relate(dir(), cowork.projectOf(item)!)}
                          >
                            <div class="flex flex-col min-w-0">
                              <DropdownMenu.ItemLabel class="truncate">{label(item)}</DropdownMenu.ItemLabel>
                              <span class="truncate text-11-regular text-text-weak">{item}</span>
                            </div>
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </Show>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          )}
        </Show>

        <div class="min-h-0 max-h-[60vh] overflow-auto rounded-md border border-border-weak-base">
          <table class="w-full text-12-regular">
            <thead class="sticky top-0 bg-background-base text-text-weak">
              <tr class="text-left border-b border-border-weak-base">
                <th class="font-medium px-3 py-2">{language.t("archive.col.title")}</th>
                <th class="font-medium px-3 py-2">{language.t("archive.col.type")}</th>
                <th class="font-medium px-3 py-2">{language.t("archive.col.started")}</th>
                <th class="font-medium px-3 py-2">{language.t("archive.col.ended")}</th>
                <th class="font-medium px-3 py-2 text-right">{language.t("archive.col.tokens")}</th>
                <th class="font-medium px-3 py-2 text-right">{language.t("archive.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(session) => {
                  const [count] = createResource(() => used(session))
                  const kind = () => archive.kind(session)
                  return (
                    <tr data-session-id={session.id} class="border-b border-border-weak-base last:border-b-0">
                      <td class="px-3 py-2 max-w-64">
                        <button
                          type="button"
                          class="block w-full text-left truncate text-13-regular text-text-strong hover:underline"
                          onClick={() => open(session)}
                        >
                          {sessionTitle(session.title) || language.t("command.session.new")}
                        </button>
                        <span class="block truncate text-text-weak">{getFilename(session.directory)}</span>
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <span
                          class="px-1.5 py-0.5 rounded"
                          classList={{
                            "bg-surface-info-weak text-text-on-info-base": kind() === "auto",
                            "bg-surface-raised-base text-text-base": kind() === "manual" || kind() === "finished",
                            "bg-surface-success-weak text-text-on-success-base": kind() === "active",
                          }}
                        >
                          {language.t(`search.type.${kind()}`)}
                        </span>
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-text-base">{when(session.time.created)}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-text-base">{when(session.time.updated)}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-right tabular-nums text-text-base">
                        <Show when={!count.loading} fallback="…">
                          {count() === undefined ? "—" : compact(count()!)}
                        </Show>
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1">
                          <Show when={!session.time.archived}>
                            <Button
                              variant="ghost"
                              size="small"
                              data-action={kind() === "finished" ? "search-reopen" : "search-finish"}
                              onClick={() =>
                                kind() === "finished" ? archive.reopen(session) : archive.finish(session)
                              }
                            >
                              {language.t(kind() === "finished" ? "session.reopen" : "session.finish")}
                            </Button>
                          </Show>
                          <Button
                            variant="ghost"
                            size="small"
                            data-action={session.time.archived ? "search-restore" : "search-archive"}
                            disabled={state.busy === session.id}
                            onClick={() => void act(session)}
                          >
                            {language.t(session.time.archived ? "archive.restore" : "archive.archive")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                }}
              </For>
            </tbody>
          </table>
          <Show when={!list.loading && rows().length === 0}>
            <div class="px-3 py-6 text-center text-13-regular text-text-weak">{language.t("archive.empty")}</div>
          </Show>
          <Show when={list.loading}>
            <div class="px-3 py-6 text-center text-13-regular text-text-weak">{language.t("prompt.loading")}</div>
          </Show>
        </div>
        <Show when={(list()?.length ?? 0) >= PAGE}>
          <div class="text-12-regular text-text-weak">{language.t("archive.more")}</div>
        </Show>
      </div>
    </Dialog>
  )
}

/** Fixed-width tick slot so ticked and unticked choices line up. */
function Tick(props: { on: boolean }) {
  return (
    <span class="size-4 shrink-0 flex items-center justify-center">
      <Show when={props.on}>
        <Icon name="check-small" size="small" />
      </Show>
    </span>
  )
}
