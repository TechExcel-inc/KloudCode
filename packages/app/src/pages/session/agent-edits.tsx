import { createMemo, For, Show } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { getFilename } from "@opencode-ai/util/path"
import type { SnapshotFileDiff, Todo, VcsFileDiff } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { AgentCommit } from "./agent-commit"

export const EDITS_WIDTH = 280

export function AgentEdits(props: {
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  todos: () => Todo[]
  session?: string
  onOpen: (path: string) => void
}) {
  const finished = createMemo(() => props.todos().filter((todo) => todo.status === "completed").length)
  const language = useLanguage()
  const added = createMemo(() => props.diffs().reduce((sum, diff) => sum + (diff.additions ?? 0), 0))
  const removed = createMemo(() => props.diffs().reduce((sum, diff) => sum + (diff.deletions ?? 0), 0))

  return (
    <aside
      data-component="agent-edits"
      aria-label={language.t("agent.edits.title")}
      class="shrink-0 h-full flex flex-col min-h-0 border-l border-border-weaker-base bg-background-base"
      style={{ width: `${EDITS_WIDTH}px` }}
    >
      <div class="shrink-0 h-10 px-4 flex items-center justify-between border-b border-border-weaker-base">
        <div class="flex items-center gap-2 text-14-medium text-text-strong">
          <Icon name="review" size="small" />
          {language.t("agent.edits.title")}
        </div>
        <Show when={props.diffs().length > 0}>
          <div class="flex items-center gap-1.5 text-12-mono">
            <span class="text-text-weak">{language.t("agent.edits.files", { count: props.diffs().length })}</span>
            <span class="text-text-diff-add-base">+{added()}</span>
            <span class="text-text-diff-delete-base">-{removed()}</span>
          </div>
        </Show>
      </div>
      <Show
        when={props.diffs().length > 0}
        fallback={
          <div class="flex-1 px-6 pb-24 flex flex-col items-center justify-center gap-2 text-center">
            <Icon name="review" size="large" class="text-icon-weak" />
            <div class="text-12-regular text-text-weak">{language.t("agent.edits.empty")}</div>
          </div>
        }
      >
        <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar py-2 px-2 flex flex-col gap-0.5">
          <For each={props.diffs()}>
            {(diff) => {
              const dir = () => diff.file.slice(0, Math.max(0, diff.file.length - getFilename(diff.file).length - 1))
              return (
                <button
                  type="button"
                  data-action="agent-edit-file"
                  title={language.t("agent.edits.open")}
                  class="w-full min-w-0 px-2 py-1.5 rounded-md flex items-center gap-2 text-left hover:bg-surface-base-hover"
                  onClick={() => props.onOpen(diff.file)}
                >
                  <FileIcon node={{ path: diff.file, type: "file" }} class="size-4 shrink-0" />
                  <div class="flex-1 min-w-0 flex flex-col">
                    <span class="text-12-medium text-text-strong truncate">{getFilename(diff.file)}</span>
                    <Show when={dir()}>
                      <span class="text-12-regular text-text-weak truncate">{dir()}</span>
                    </Show>
                  </div>
                  <div class="shrink-0 flex items-center gap-1 text-12-mono">
                    <Show when={diff.additions}>
                      <span class="text-text-diff-add-base">+{diff.additions}</span>
                    </Show>
                    <Show when={diff.deletions}>
                      <span class="text-text-diff-delete-base">-{diff.deletions}</span>
                    </Show>
                  </div>
                </button>
              )
            }}
          </For>
        </div>
      </Show>
      <AgentCommit session={props.session} diffs={props.diffs} />
      <Show when={props.todos().length > 0}>
        <div class="shrink-0 max-h-[45%] flex flex-col min-h-0 border-t border-border-weaker-base">
          <div class="shrink-0 h-10 px-4 flex items-center justify-between">
            <div class="flex items-center gap-2 text-14-medium text-text-strong">
              <Icon name="checklist" size="small" />
              {language.t("agent.todos.title")}
            </div>
            <span class="text-12-mono text-text-weak">
              {finished()}/{props.todos().length}
            </span>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-3 flex flex-col gap-2">
            <For each={props.todos()}>
              {(todo) => (
                <div class="flex items-start gap-2 min-w-0">
                  <span
                    class="shrink-0 mt-1.5 size-2 rounded-full"
                    classList={{
                      "bg-icon-success-base": todo.status === "completed",
                      "bg-text-interactive-base": todo.status === "in_progress",
                      "bg-icon-weak-base": todo.status === "pending",
                      "bg-text-diff-delete-base": todo.status === "cancelled",
                    }}
                  />
                  <span
                    class="text-12-regular min-w-0"
                    classList={{
                      "text-text-strong": todo.status === "in_progress",
                      "text-text-base": todo.status === "pending",
                      "text-text-weak line-through": todo.status === "completed" || todo.status === "cancelled",
                    }}
                  >
                    {todo.content}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </aside>
  )
}
