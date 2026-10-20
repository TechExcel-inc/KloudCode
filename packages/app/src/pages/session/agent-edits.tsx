import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { getFilename } from "@opencode-ai/util/path"
import type { AssistantMessage, SnapshotFileDiff, VcsFileDiff } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useCowork } from "@/context/cowork"
import { githubRepo } from "@/ead/cowork"
import { estimateSessionContextBreakdown } from "@/components/session/session-context-breakdown"
import { AgentCommit } from "./agent-commit"
import { contextView, formatPercent, formatTokens, type ContextRowKey } from "./agent-context"
import { OUTPUT_GROUPS, sessionOutputs, type Output, type OutputGroup } from "./agent-outputs"

export const EDITS_WIDTH = 320

const ROW_COLOR: Record<ContextRowKey, string> = {
  messages: "#4C8DF6",
  systemTools: "#D9663A",
  mcpTools: "#3FA37A",
  systemPrompt: "#C9962E",
  skills: "#A3A19A",
  memoryFiles: "#A3A19A",
  customAgents: "#A3A19A",
  autocompactBuffer: "#6B6A66",
  freeSpace: "transparent",
}

/** Rows whose name explains itself on hover, as in Claude Code. */
const EXPLAINED = new Set<ContextRowKey>(["mcpTools", "systemPrompt", "skills", "memoryFiles", "customAgents"])

const GROUP_ICON: Record<OutputGroup, "code" | "open-file" | "photo" | "window-cursor"> = {
  code: "code",
  documents: "open-file",
  images: "photo",
  pages: "window-cursor",
}

const SHOWN = 3

const tokenTotal = (msg: AssistantMessage) =>
  msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write

const home = (dir: string) => dir.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Za-z]:\\Users\\[^\\]+/, "~")

function Box(props: {
  name: string
  title: string
  open: boolean
  onToggle: () => void
  right?: JSX.Element
  children?: JSX.Element
}) {
  return (
    <section data-component={`agent-panel-${props.name}`} class="rounded-xl border border-border-weak-base bg-background-base">
      <button
        type="button"
        data-action={`agent-panel-${props.name}-toggle`}
        aria-expanded={props.open}
        class="w-full h-11 px-4 flex items-center gap-1.5 text-left"
        onClick={props.onToggle}
      >
        <span class="text-14-medium text-text-strong">{props.title}</span>
        <Icon name={props.open ? "chevron-down" : "chevron-right"} size="small" class="text-icon-weak" />
        <span class="ml-auto flex items-center gap-2 text-13-regular text-text-weak">{props.right}</span>
      </button>
      <Show when={props.open && props.children}>
        <div class="px-4 pb-3 -mt-1 flex flex-col">{props.children}</div>
      </Show>
    </section>
  )
}

function Row(props: { icon: JSX.Element; children: JSX.Element; right?: JSX.Element; title?: string }) {
  return (
    <div class="h-8 flex items-center gap-2.5 min-w-0" title={props.title}>
      <span class="shrink-0 flex items-center text-icon-weak">{props.icon}</span>
      <span class="flex-1 min-w-0 truncate text-13-regular text-text-strong">{props.children}</span>
      <Show when={props.right}>
        <span class="shrink-0 text-12-regular text-text-weak">{props.right}</span>
      </Show>
    </div>
  )
}

function List(props: { name: string; label: string; items: { name: string; tokens: number }[] }) {
  const [open, setOpen] = createSignal(false)
  return (
    <div data-component={`agent-context-list-${props.name}`}>
      <button
        type="button"
        data-action={`agent-context-list-${props.name}`}
        aria-expanded={open()}
        class="w-full h-8 flex items-center gap-2 text-left rounded-md hover:bg-surface-base-hover"
        onClick={() => setOpen(!open())}
      >
        <Icon name={open() ? "chevron-down" : "chevron-right"} size="small" class="text-icon-weak" />
        <span class="flex-1 text-13-regular text-text-strong">{props.label}</span>
        <span class="text-12-regular text-text-weak">{props.items.length}</span>
      </button>
      <Show when={open()}>
        <div class="pl-6 pb-1 flex flex-col">
          <For each={props.items}>
            {(item) => (
              <div class="h-6 flex items-center gap-2 min-w-0 text-12-regular" title={item.name}>
                <span class="flex-1 min-w-0 truncate text-text-base">{getFilename(item.name) || item.name}</span>
                <span class="shrink-0 text-text-weak">{formatTokens(item.tokens)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

/**
 * The Agent view's right panel, laid out like Claude Code's: where the session works (Environment),
 * what fills the model's context window (Context), the files the AI made (Outputs), and the code it
 * changed in this folder (Changes, with Commit with AI).
 */
export function AgentEdits(props: {
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  session?: string
  onOpen: (path: string) => void
  onOpenOutput: (path: string) => void
}) {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const cowork = useCowork()
  const [open, setOpen] = createSignal({ environment: true, context: false, outputs: false, changes: true })
  const toggle = (key: keyof ReturnType<typeof open>) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  const [shown, setShown] = createSignal<Partial<Record<OutputGroup, boolean>>>({})

  const messages = createMemo(() => (props.session ? (sync.data.message[props.session] ?? []) : []))
  const lastUser = createMemo(() => messages().findLast((msg) => msg.role === "user")?.id)
  const total = createMemo(() => {
    const msg = messages().findLast((item) => item.role === "assistant" && tokenTotal(item) > 0)
    return msg?.role === "assistant" ? tokenTotal(msg) : undefined
  })

  // The fixed parts change with the agent, model, tools and files, which are chosen per message.
  const [size] = createResource(
    () => (props.session ? { session: props.session, user: lastUser() ?? "" } : undefined),
    (input) =>
      sdk.client.session
        .context({ sessionID: input.session })
        .then((res) => res.data)
        .catch(() => undefined),
  )
  // Real token counts priced at the model's list price, so only an estimate of the bill.
  const cost = createMemo(() => messages().reduce((sum, msg) => sum + (msg.role === "assistant" ? msg.cost : 0), 0))
  const money = (value: number) =>
    value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: value < 0.01 && value > 0 ? 4 : 2 })

  // The conversation's own size, estimated from its text; scaled with the rest to the real count.
  const conversation = createMemo(() =>
    estimateSessionContextBreakdown({ messages: messages(), parts: sync.data.part, input: Number.MAX_SAFE_INTEGER })
      .filter((item) => item.key !== "other" && item.key !== "system")
      .reduce((sum, item) => sum + item.tokens, 0),
  )
  const view = createMemo(() => {
    const value = size.latest
    return value ? contextView(value, total(), conversation()) : undefined
  })

  const outputs = createMemo(() =>
    sessionOutputs(messages().flatMap((msg) => sync.data.part[msg.id] ?? [])),
  )
  const grouped = createMemo(() => {
    const out: Partial<Record<OutputGroup, Output[]>> = {}
    for (const item of outputs()) (out[item.group] ??= []).push(item)
    return OUTPUT_GROUPS.flatMap((group) => (out[group] ? [{ group, items: out[group]! }] : []))
  })
  const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

  const added = createMemo(() => props.diffs().reduce((sum, diff) => sum + (diff.additions ?? 0), 0))
  const removed = createMemo(() => props.diffs().reduce((sum, diff) => sum + (diff.deletions ?? 0), 0))
  const count = (value: number) => value.toLocaleString()

  const directory = () => sdk.directory
  const repo = createMemo(() => {
    const url = sync.data.vcs?.remote_url
    return url ? githubRepo(url) : undefined
  })

  return (
    <aside
      data-component="agent-edits"
      aria-label={language.t("agent.panel.title")}
      class="shrink-0 h-full min-h-0 overflow-y-auto no-scrollbar border-l border-border-weaker-base bg-background-base"
      style={{ width: `${EDITS_WIDTH}px` }}
    >
      <div class="p-3 flex flex-col gap-3">
        <Box name="environment" title={language.t("agent.environment.title")} open={open().environment} onToggle={() => toggle("environment")}>
          <Show when={repo()}>
            {(value) => <Row icon={<Icon name="github" size="small" />}>{value()}</Row>}
          </Show>
          <Row icon={<Icon name="folder" size="small" />} title={directory()}>
            {getFilename(directory()) || directory()}
            <span class="text-text-weak"> · {home(directory())}</span>
          </Row>
          <Show when={sync.data.vcs?.branch}>
            {(branch) => <Row icon={<Icon name="branch" size="small" />}>{branch()}</Row>}
          </Show>
          <Row
            icon={<Icon name="server" size="small" />}
            right={language.t(cowork.signedIn() ? "agent.environment.enabled" : "agent.environment.off")}
          >
            {language.t("agent.environment.enterprise")}
          </Row>
        </Box>

        <Box
          name="context"
          title={language.t("agent.context.title")}
          open={open().context}
          onToggle={() => toggle("context")}
          right={
            <Show when={view()}>
              {(value) => (
                <Tooltip
                  placement="left"
                  value={
                    <div data-component="agent-context-cost" class="flex flex-col gap-0.5">
                      <span>{language.t("agent.context.cost", { cost: money(cost()) })}</span>
                      <span class="opacity-70">{language.t("agent.context.cost.hint")}</span>
                    </div>
                  }
                >
                  <span class="flex items-center gap-2">
                    <span>{Math.round(value().percent)}%</span>
                    <span class="w-11 h-3.5 rounded-full bg-surface-base border border-border-weak-base relative overflow-hidden">
                      <span
                        class="absolute left-0.5 top-0.5 bottom-0.5 rounded-full"
                        style={{ background: ROW_COLOR.messages, width: `max(8px, ${Math.min(100, value().percent)}%)` }}
                      />
                    </span>
                  </span>
                </Tooltip>
              )}
            </Show>
          }
        >
          <Show
            when={view()}
            fallback={<div class="py-1 text-12-regular text-text-weak">{language.t("agent.context.loading")}</div>}
          >
            {(value) => (
              <>
                <div class="flex items-baseline">
                  <span class="text-14-medium text-text-strong">
                    {language.t("agent.context.used", { percent: Math.round(value().percent) })}
                  </span>
                  <span class="ml-auto text-12-regular text-text-weak">
                    {formatTokens(value().used)} / {value().limit ? formatTokens(value().limit) : "?"}
                  </span>
                </div>
                <div class="mt-2 mb-2 h-1.5 rounded-full bg-surface-base flex overflow-hidden">
                  <For each={value().rows.filter((row) => row.key !== "freeSpace")}>
                    {(row) => <span style={{ width: `${row.percent}%`, background: ROW_COLOR[row.key] }} />}
                  </For>
                </div>
                <For each={value().rows}>
                  {(row) => {
                    const label = (
                      <span
                        classList={{ "underline decoration-dotted underline-offset-4 decoration-text-weak": EXPLAINED.has(row.key) }}
                      >
                        {language.t(`agent.context.${row.key}`)}
                      </span>
                    )
                    return (
                      <div data-row={row.key} class="h-7 grid grid-cols-[12px_1fr_auto_42px] gap-x-2.5 items-center text-13-regular">
                        <span
                          class="size-3 rounded-[3px]"
                          classList={{ "border border-border-weak-base": row.key === "freeSpace" }}
                          style={{ background: ROW_COLOR[row.key] }}
                        />
                        <span class="min-w-0 truncate text-text-strong">
                          <Show when={EXPLAINED.has(row.key)} fallback={label}>
                            <Tooltip placement="left" value={language.t(`agent.context.${row.key}.hint`)}>
                              {label}
                            </Tooltip>
                          </Show>
                        </span>
                        <span class="text-right text-text-weak">{formatTokens(row.tokens)}</span>
                        <span class="text-right text-text-strong">{value().limit ? formatPercent(row.percent) : "—"}</span>
                      </div>
                    )
                  }}
                </For>
                <div class="mt-2">
                  <List name="mcp" label={language.t("agent.context.mcpTools")} items={size.latest?.mcpToolList ?? []} />
                  <List name="memory" label={language.t("agent.context.memoryFiles")} items={size.latest?.memoryFileList ?? []} />
                  <List name="agents" label={language.t("agent.context.customAgents")} items={size.latest?.customAgentList ?? []} />
                </div>
              </>
            )}
          </Show>
        </Box>

        <Box
          name="outputs"
          title={language.t("agent.outputs.title")}
          open={open().outputs}
          onToggle={() => toggle("outputs")}
          right={<span>{outputs().length}</span>}
        >
          <Show
            when={outputs().length > 0}
            fallback={<div class="py-1 text-12-regular text-text-weak">{language.t("agent.outputs.empty")}</div>}
          >
            <For each={grouped()}>
              {(entry) => {
                const more = () => entry.items.length - SHOWN
                const items = () => (shown()[entry.group] ? entry.items : entry.items.slice(0, SHOWN))
                return (
                  <div class="flex flex-col">
                    <div class="pt-2 pb-0.5 flex text-12-regular text-text-weak">
                      {language.t(`agent.outputs.${entry.group}`)}
                      <span class="ml-auto">{entry.items.length}</span>
                    </div>
                    <For each={items()}>
                      {(item) => (
                        <button
                          type="button"
                          data-action="agent-output-open"
                          title={item.path}
                          class="w-full h-8 flex items-center gap-2.5 min-w-0 text-left rounded-md hover:bg-surface-base-hover"
                          onClick={() => props.onOpenOutput(item.path)}
                        >
                          <Icon name={GROUP_ICON[item.group]} size="small" class="shrink-0 text-icon-weak" />
                          <span class="flex-1 min-w-0 truncate text-13-regular text-text-strong">{getFilename(item.path)}</span>
                          <span class="shrink-0 text-12-regular text-text-weak">{time(item.time)}</span>
                        </button>
                      )}
                    </For>
                    <Show when={more() > 0 && !shown()[entry.group]}>
                      <button
                        type="button"
                        data-action="agent-output-more"
                        class="h-7 pl-7 text-left text-12-regular text-text-weak hover:text-text-base"
                        onClick={() => setShown((prev) => ({ ...prev, [entry.group]: true }))}
                      >
                        {language.t("agent.outputs.more", { count: more() })}
                      </button>
                    </Show>
                  </div>
                )
              }}
            </For>
          </Show>
        </Box>

        <Box
          name="changes"
          title={language.t("agent.changes.title")}
          open={open().changes}
          onToggle={() => toggle("changes")}
          right={
            <Show when={!open().changes && props.diffs().length > 0}>
              <span class="text-12-mono text-text-diff-add-base">+{count(added())}</span>
              <span class="text-12-mono text-text-diff-delete-base">-{count(removed())}</span>
            </Show>
          }
        >
          <Show
            when={props.diffs().length > 0}
            fallback={<div class="py-1 text-12-regular text-text-weak">{language.t("agent.edits.empty")}</div>}
          >
            <div class="h-8 flex items-center gap-2 text-12-mono">
              <Icon name="review" size="small" class="text-icon-weak" />
              <span class="text-text-diff-add-base">+{count(added())}</span>
              <span class="text-text-diff-delete-base">-{count(removed())}</span>
              <span class="ml-auto text-12-regular text-text-weak">
                {language.t("agent.edits.files", { count: props.diffs().length })}
              </span>
            </div>
            <div class="max-h-64 overflow-y-auto no-scrollbar flex flex-col">
              <For each={props.diffs()}>
                {(diff) => (
                  <button
                    type="button"
                    data-action="agent-edit-file"
                    title={diff.file}
                    class="w-full h-8 min-w-0 px-1 rounded-md flex items-center gap-2 text-left hover:bg-surface-base-hover"
                    onClick={() => props.onOpen(diff.file)}
                  >
                    <FileIcon node={{ path: diff.file, type: "file" }} class="size-4 shrink-0" />
                    <span class="flex-1 min-w-0 truncate text-13-regular text-text-strong">{getFilename(diff.file)}</span>
                    <span class="shrink-0 flex items-center gap-1 text-12-mono">
                      <Show when={diff.additions}>
                        <span class="text-text-diff-add-base">+{diff.additions}</span>
                      </Show>
                      <Show when={diff.deletions}>
                        <span class="text-text-diff-delete-base">-{diff.deletions}</span>
                      </Show>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <AgentCommit session={props.session} diffs={props.diffs} inline />
        </Box>
      </div>
    </aside>
  )
}
