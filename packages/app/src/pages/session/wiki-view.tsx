import { createMemo, createResource, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Marked } from "marked"
import TurndownService from "turndown"
import DOMPurify from "dompurify"
import { Button } from "@opencode-ai/ui/button"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import "./wiki.css"

const ROOT = "wiki"
const DELAY = 800
const POLL = 4000

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
})

// Own instance: the shared one has async extensions (syntax highlighting) registered.
const parser = new Marked({ gfm: true })

const html = (md: string) => DOMPurify.sanitize(parser.parse(md, { async: false }) as string)

const title = (path: string) => path.slice(ROOT.length + 1).replace(/\.md$/i, "")

const slug = (name: string) =>
  name
    .trim()
    .replace(/[\\:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\/+|\/+$/g, "")

const page = (file: string, root: string) => {
  const value = file.replace(/\\/g, "/")
  const rel = value.startsWith(root + "/") ? value.slice(root.length + 1) : value
  if (!rel.startsWith(ROOT + "/") || !/\.md$/i.test(rel)) return
  return rel
}

export function WikiView() {
  const layout = useLayout()
  return (
    <Show when={layout.nav.current() === "wiki"}>
      <Wiki />
    </Show>
  )
}

function Wiki() {
  const sdk = useSDK()
  const layout = useLayout()
  const prompt = usePrompt()
  const language = useLanguage()
  const [state, setState] = createStore({
    active: "",
    query: "",
    draft: undefined as string | undefined,
    status: "idle" as "idle" | "saving" | "saved" | "error" | "updated",
    conflict: false,
    tick: 0,
  })
  let editor: HTMLDivElement | undefined
  let timer: number | undefined
  let dirty = false
  // Markdown last loaded from or written to disk for the open page; anything else on disk is an outside edit.
  let last = ""

  const walk = async (dir: string): Promise<string[]> => {
    const nodes = await sdk.client.file
      .list({ path: dir })
      .then((res) => res.data ?? [])
      .catch(() => [])
    const nested = await Promise.all(
      nodes.filter((node) => node.type === "directory" && !node.ignored).map((node) => walk(node.path)),
    )
    return [
      ...nodes.filter((node) => node.type === "file" && /\.md$/i.test(node.name)).map((node) => node.path),
      ...nested.flat(),
    ].sort((a, b) => a.localeCompare(b))
  }

  const [pages, { refetch }] = createResource(() => state.tick, () => walk(ROOT), { initialValue: [] })
  const shown = createMemo(() => {
    const query = state.query.trim().toLowerCase()
    if (!query) return pages()
    return pages().filter((path) => title(path).toLowerCase().includes(query))
  })

  const read = (path: string) =>
    sdk.client.file
      .read({ path })
      .then((res) => res.data?.content ?? "")
      .catch(() => undefined)

  const show = (content: string) => {
    last = content
    dirty = false
    if (editor) editor.innerHTML = html(content)
  }

  // force: the user chose to keep their version over an outside edit.
  const save = async (force?: boolean) => {
    if (!dirty || !editor || !state.active || (state.conflict && !force)) return
    const path = state.active
    const disk = await read(path)
    if (!force && disk !== undefined && disk !== last) {
      setState("conflict", true)
      return
    }
    dirty = false
    const content = turndown.turndown(editor.innerHTML).trim() + "\n"
    setState("status", "saving")
    await sdk.client.file
      .write({ path, content })
      .then(() => {
        if (state.active === path) last = content
        setState({ status: state.active === path && !dirty ? "saved" : state.status, conflict: false })
      })
      .catch(() => {
        dirty = true
        setState("status", "error")
      })
  }

  // Picks up edits made by the agent or another window.
  const check = async () => {
    const path = state.active
    if (!path || state.status === "saving") return
    const disk = await read(path)
    if (disk === undefined || disk === last || state.active !== path) return
    if (dirty) {
      setState("conflict", true)
      return
    }
    show(disk)
    setState("status", "updated")
  }

  const reload = async () => {
    const disk = await read(state.active)
    if (disk === undefined) return
    show(disk)
    setState({ conflict: false, status: "updated" })
  }

  const keep = () => {
    dirty = true
    void save(true)
  }

  const attach = (path: string) => {
    prompt.context
      .items()
      .filter((item) => item.type === "file" && !item.selection && page(item.path, sdk.directory) && item.path !== path)
      .forEach((item) => prompt.context.remove(item.key))
    prompt.context.add({ type: "file", path })
  }

  const schedule = () => {
    dirty = true
    setState("status", "idle")
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => void save(), DELAY)
  }

  const open = async (path: string) => {
    if (timer !== undefined) window.clearTimeout(timer)
    await save()
    const content = await read(path)
    setState({ active: path, status: "idle", conflict: false })
    show(content ?? "")
    attach(path)
    editor?.focus()
  }

  const create = async () => {
    const name = slug(state.draft ?? "")
    if (!name) return
    const path = `${ROOT}/${name}.md`
    setState("draft", undefined)
    if (!pages().includes(path)) {
      await sdk.client.file.write({ path, content: `# ${name.split("/").pop()}\n\n` })
      setState("tick", (n) => n + 1)
      await refetch()
    }
    await open(path)
  }

  onMount(() => {
    const stop = sdk.event.listen((event) => {
      const detail = event.details as { type: string; properties?: { file?: unknown } }
      if (detail.type !== "file.edited" && detail.type !== "file.watcher.updated") return
      const file = typeof detail.properties?.file === "string" ? page(detail.properties.file, sdk.directory) : undefined
      if (!file) return
      if (!pages().includes(file)) setState("tick", (n) => n + 1)
      if (file === state.active) void check()
    })
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      setState("tick", (n) => n + 1)
      void check()
    }, POLL)
    onCleanup(() => {
      stop()
      window.clearInterval(poll)
    })
  })

  onCleanup(() => {
    if (timer !== undefined) window.clearTimeout(timer)
    void save()
  })

  const run = (cmd: string, value?: string) => {
    editor?.focus()
    document.execCommand(cmd, false, value)
    schedule()
  }

  const tools: { icon?: IconProps["name"]; text?: string; label: Parameters<typeof language.t>[0]; act: () => void }[] = [
    { text: "H1", label: "wiki.tool.h1", act: () => run("formatBlock", "h1") },
    { text: "H2", label: "wiki.tool.h2", act: () => run("formatBlock", "h2") },
    { text: "H3", label: "wiki.tool.h3", act: () => run("formatBlock", "h3") },
    { text: "B", label: "wiki.tool.bold", act: () => run("bold") },
    { text: "I", label: "wiki.tool.italic", act: () => run("italic") },
    { text: "S", label: "wiki.tool.strike", act: () => run("strikeThrough") },
    { icon: "bullet-list", label: "wiki.tool.bullets", act: () => run("insertUnorderedList") },
    { text: "1.", label: "wiki.tool.numbers", act: () => run("insertOrderedList") },
    { text: "❝", label: "wiki.tool.quote", act: () => run("formatBlock", "blockquote") },
    { icon: "code", label: "wiki.tool.code", act: () => run("formatBlock", "pre") },
    { text: "¶", label: "wiki.tool.text", act: () => run("formatBlock", "p") },
  ]

  const status = createMemo(() => {
    if (state.status === "saving") return language.t("wiki.status.saving")
    if (state.status === "saved") return language.t("wiki.status.saved")
    if (state.status === "error") return language.t("wiki.status.error")
    if (state.status === "updated") return language.t("wiki.status.updated")
    return ""
  })

  return (
    <div
      data-component="wiki-view"
      class="absolute inset-y-0 left-0 z-40 flex bg-background-base"
      style={{ right: layout.code.chat() ? `${layout.code.width()}px` : "0px" }}
    >
      <aside class="w-64 shrink-0 h-full flex flex-col min-h-0 border-r border-border-weaker-base bg-background-base">
        <div class="shrink-0 h-12 px-3 flex items-center justify-between">
          <div class="flex items-center gap-2 text-14-medium text-text-strong">
            <Icon name="open-file" size="small" />
            {language.t("rail.wiki")}
          </div>
          <Tooltip placement="bottom" value={language.t("wiki.new")}>
            <IconButton
              icon="plus-small"
              variant="ghost"
              data-action="wiki-new"
              aria-label={language.t("wiki.new")}
              onClick={() => setState("draft", "")}
            />
          </Tooltip>
        </div>
        <div class="shrink-0 px-3 pb-2 flex flex-col gap-2">
          <Show when={state.draft !== undefined}>
            <input
              type="text"
              data-action="wiki-new-name"
              ref={(el) => requestAnimationFrame(() => el.focus())}
              value={state.draft ?? ""}
              onInput={(event) => setState("draft", event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void create()
                if (event.key === "Escape") setState("draft", undefined)
              }}
              onBlur={() => {
                if (!state.draft?.trim()) setState("draft", undefined)
              }}
              placeholder={language.t("wiki.new.placeholder")}
              class="h-8 px-2 rounded-md bg-surface-base border border-border-interactive-base text-12-regular text-text-strong placeholder:text-text-weak outline-none"
            />
          </Show>
          <div class="flex items-center gap-2 h-8 px-2 rounded-md bg-surface-base border border-border-weak-base focus-within:border-border-interactive-base">
            <Icon name="magnifying-glass" size="small" class="text-icon-weak shrink-0" />
            <input
              type="text"
              data-action="wiki-search"
              value={state.query}
              onInput={(event) => setState("query", event.currentTarget.value)}
              placeholder={language.t("wiki.search")}
              class="flex-1 min-w-0 bg-transparent text-12-regular text-text-strong placeholder:text-text-weak outline-none"
            />
          </div>
        </div>
        <nav class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 pb-3 flex flex-col gap-0.5">
          <For each={shown()}>
            {(path) => (
              <button
                type="button"
                data-action="wiki-page"
                class="w-full min-w-0 px-2 py-1.5 rounded-md flex items-center gap-2 text-left text-14-regular"
                classList={{
                  "bg-surface-base-active text-text-strong": state.active === path,
                  "text-text-base hover:bg-surface-base-hover": state.active !== path,
                }}
                onClick={() => void open(path)}
              >
                <Icon name="open-file" size="small" class="shrink-0 text-icon-weak" />
                <span class="truncate">{title(path)}</span>
              </button>
            )}
          </For>
          <Show when={!pages.loading && shown().length === 0}>
            <div class="px-2 py-3 text-12-regular text-text-weak">
              {state.query ? language.t("wiki.none") : language.t("wiki.empty")}
            </div>
          </Show>
        </nav>
      </aside>

      <section class="flex-1 min-w-0 h-full flex flex-col">
        <Show
          when={state.active}
          fallback={
            <div class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div class="size-12 rounded-xl bg-surface-base flex items-center justify-center text-text-weak">
                <Icon name="open-file" size="large" />
              </div>
              <div class="text-16-medium text-text-strong">{language.t("wiki.start.title")}</div>
              <div class="text-14-regular text-text-weak max-w-md">{language.t("wiki.start.body")}</div>
              <Button variant="primary" size="large" icon="plus-small" onClick={() => setState("draft", "")}>
                {language.t("wiki.new")}
              </Button>
            </div>
          }
        >
          <div class="shrink-0 h-12 px-4 flex items-center gap-3 border-b border-border-weaker-base">
            <div class="min-w-0 flex items-center gap-1 text-12-regular text-text-weak">
              <span>{ROOT}</span>
              <span>/</span>
              <span class="text-14-medium text-text-strong truncate">{title(state.active)}</span>
            </div>
            <div class="flex-1" />
            <span
              class="text-12-regular"
              classList={{
                "text-text-weak": state.status !== "error",
                "text-text-diff-delete-base": state.status === "error",
              }}
            >
              {status()}
            </span>
            <Tooltip
              placement="bottom"
              value={language.t(layout.code.chat() ? "code.chat.hide" : "code.chat.show")}
            >
              <IconButton
                icon={layout.code.chat() ? "layout-right-full" : "layout-right"}
                variant="ghost"
                data-action="wiki-chat-toggle"
                onClick={() => layout.code.toggle()}
                aria-label={language.t(layout.code.chat() ? "code.chat.hide" : "code.chat.show")}
              />
            </Tooltip>
          </div>
          <Show when={state.conflict}>
            <div
              data-component="wiki-conflict"
              class="shrink-0 px-4 py-2 flex items-center gap-3 bg-surface-warning-weak border-b border-border-weaker-base"
            >
              <Icon name="warning" size="small" class="shrink-0 text-text-on-warning-base" />
              <span class="flex-1 min-w-0 text-12-regular text-text-on-warning-base">{language.t("wiki.conflict")}</span>
              <Button size="small" variant="secondary" data-action="wiki-conflict-reload" onClick={() => void reload()}>
                {language.t("wiki.conflict.reload")}
              </Button>
              <Button size="small" variant="ghost" data-action="wiki-conflict-keep" onClick={keep}>
                {language.t("wiki.conflict.keep")}
              </Button>
            </div>
          </Show>
          <div class="shrink-0 px-4 py-1.5 flex items-center gap-0.5 border-b border-border-weaker-base">
            <For each={tools}>
              {(tool) => (
                <Tooltip placement="bottom" value={language.t(tool.label)}>
                  <button
                    type="button"
                    data-action="wiki-tool"
                    aria-label={language.t(tool.label)}
                    class="h-7 min-w-7 px-1.5 rounded-md flex items-center justify-center text-12-medium text-text-base hover:bg-surface-base-hover"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={tool.act}
                  >
                    <Show when={tool.icon} fallback={tool.text}>
                      {(name) => <Icon name={name()} size="small" />}
                    </Show>
                  </button>
                </Tooltip>
              )}
            </For>
          </div>
        </Show>
        <div class="flex-1 min-h-0 overflow-y-auto" classList={{ hidden: !state.active }}>
          <div class="max-w-3xl mx-auto px-10 py-8 h-full">
            <div
              ref={editor}
              data-component="wiki-editor"
              data-placeholder={language.t("wiki.placeholder")}
              contentEditable
              spellcheck
              onInput={schedule}
              onBlur={() => void save()}
              onKeyDown={(event) => {
                if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return
                event.preventDefault()
                if (timer !== undefined) window.clearTimeout(timer)
                void save()
              }}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
