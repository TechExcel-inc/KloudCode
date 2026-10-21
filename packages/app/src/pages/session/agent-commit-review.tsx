import { createMemo, For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { useLanguage } from "@/context/language"
import { commitAndPush, commitOnly, type GitOutcome } from "./agent-git"
import {
  canCommit,
  changeStatus,
  checkedByDefault,
  fileWarnings,
  filesToCommit,
  folderGroups,
  parseReview,
  reviewPrompt,
  type ChangeFile,
  type Review,
  type Warning,
} from "./agent-review"

/**
 * "Review before commit": the files that would be committed, grouped by purpose with a checkbox each,
 * what they do in plain words, a commit message to edit, and warnings for files that should probably stay out.
 * Only the checked files are staged and committed.
 */
export function DialogCommitReview(props: {
  files: ChangeFile[]
  /** Files this session's replies changed; others are flagged "Not changed in this session". */
  sessionFiles: string[]
  message: string
  /** The branch has a remote to push to. */
  remote: boolean
  /** Asks the AI and returns its reply text. */
  ask: (prompt: string) => Promise<string>
  run: (command: string) => Promise<GitOutcome>
  onDone: (outcome: GitOutcome, subject: string, push: boolean) => void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const names = props.files.map((item) => item.file)
  const byName = new Map(props.files.map((item) => [item.file, item] as const))
  const rules = new Map(props.files.map((item) => [item.file, fileWarnings(item, props.sessionFiles)] as const))
  const [state, setState] = createStore({
    review: undefined as Review | undefined,
    reading: true,
    message: props.message,
    checked: Object.fromEntries(names.map((file) => [file, checkedByDefault(rules.get(file) ?? [])])) as Record<
      string,
      boolean
    >,
    busy: undefined as "commit" | "push" | undefined,
  })

  onMount(() => {
    // The AI summary is a help, not a gate: after a minute without an answer the review goes on without it.
    const limit = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 60_000))
    Promise.race([props.ask(reviewPrompt(props.files)), limit])
      .then((text) => (text === undefined ? undefined : parseReview(text, names)))
      .catch(() => undefined)
      .then((review) => {
        setState({ review, reading: false })
        if (review?.message && !state.message.trim()) setState("message", review.message)
      })
  })

  const groups = createMemo(() => state.review?.groups ?? folderGroups(names))
  const warnings = (file: string): Warning[] => [
    ...(rules.get(file) ?? []),
    ...(state.review?.warnings[file] ?? []).map((reason) => ({
      kind: "ai" as const,
      level: "orange" as const,
      reason,
    })),
  ]
  const picked = createMemo(() => filesToCommit(names, state.checked))
  const ready = () => !state.busy && canCommit(picked(), state.message)
  const flagged = createMemo(() => names.filter((file) => warnings(file).length > 0).length)

  const label = (item: Warning) => {
    if (item.kind === "ai") return item.reason ?? ""
    return language.t(`agent.review.warn.${item.kind}`)
  }
  const status = (file: ChangeFile) => language.t(`agent.review.status.${changeStatus(file)}`)

  const commit = (push: boolean) => {
    if (!ready()) return
    const message = state.message.trim()
    const files = picked()
    setState("busy", push ? "push" : "commit")
    void props
      .run(push ? commitAndPush(files, message) : commitOnly(files, message))
      .then((outcome) => {
        if (!outcome.committed) throw new Error(outcome.log || language.t("agent.commit.failed"))
        dialog.close()
        props.onDone(outcome, message.split("\n")[0] ?? "", push)
      })
      .catch((err: unknown) =>
        showToast({
          variant: "error",
          icon: "circle-ban-sign",
          title: language.t("agent.commit.failed"),
          description: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => setState("busy", undefined))
  }

  return (
    <Dialog title={language.t("agent.review.title")} size="large">
      <div data-component="dialog-commit-review" class="flex flex-col gap-4 px-6 pb-6 min-h-0">
        <section class="flex flex-col gap-1">
          <div class="text-13-medium text-text-strong">{language.t("agent.review.summary")}</div>
          <Show
            when={!state.reading}
            fallback={
              <div class="flex items-center gap-2 text-13-regular text-text-weak">
                <Spinner class="size-4" />
                {language.t("agent.review.reading")}
              </div>
            }
          >
            <p class="text-13-regular text-text-base select-text">
              {state.review?.summary || language.t("agent.review.noSummary")}
            </p>
          </Show>
        </section>

        <Show when={flagged() > 0}>
          <div class="rounded-md bg-surface-warning-weak px-3 py-2 text-12-regular text-on-warning-base">
            {language.t("agent.review.flagged", { count: flagged() })}
          </div>
        </Show>

        <section class="flex flex-col gap-1 min-h-0">
          <div class="flex items-center text-13-medium text-text-strong">
            {language.t("agent.review.files")}
            <span class="ml-auto text-12-regular text-text-weak">
              {language.t("agent.review.selected", { checked: picked().length, count: names.length })}
            </span>
          </div>
          <div class="max-h-[40vh] overflow-y-auto flex flex-col gap-2 rounded-md border border-border-weak-base p-2">
            <For each={groups()}>
              {(group) => {
                const all = () => group.files.every((file) => state.checked[file])
                const some = () => group.files.some((file) => state.checked[file])
                const title = () =>
                  group.title ?? (state.review ? language.t("agent.review.other") : language.t("agent.review.topLevel"))
                return (
                  <div data-component="commit-review-group" class="flex flex-col">
                    <div class="h-7 flex items-center gap-2">
                      <Checkbox
                        checked={all()}
                        indeterminate={some() && !all()}
                        onChange={(value: boolean) => group.files.forEach((file) => setState("checked", file, value))}
                        hideLabel
                      >
                        {title()}
                      </Checkbox>
                      <span class="flex-1 min-w-0 truncate text-13-medium text-text-strong">{title()}</span>
                      <span class="text-12-regular text-text-weak">{group.files.length}</span>
                    </div>
                    <For each={group.files}>
                      {(name) => {
                        const file = byName.get(name)!
                        return (
                          <div data-component="commit-review-file" class="pl-6 py-1 flex flex-col min-w-0">
                            <div class="flex items-center gap-2 min-w-0">
                              <Checkbox
                                checked={!!state.checked[name]}
                                onChange={(value: boolean) => setState("checked", name, value)}
                                hideLabel
                              >
                                {name}
                              </Checkbox>
                              <span
                                class="flex-1 min-w-0 truncate text-12-mono text-text-strong select-text"
                                title={name}
                              >
                                {getFilename(name)}
                                <span class="text-text-weak"> {getDirectory(name)}</span>
                              </span>
                              <span class="shrink-0 text-12-regular text-text-weak">{status(file)}</span>
                              <span class="shrink-0 flex items-center gap-1 text-12-mono">
                                <Show
                                  when={!file.binary}
                                  fallback={<span class="text-text-weak">{language.t("agent.review.binary")}</span>}
                                >
                                  <span class="text-text-diff-add-base">+{file.additions}</span>
                                  <span class="text-text-diff-delete-base">-{file.deletions}</span>
                                </Show>
                              </span>
                            </div>
                            <For each={warnings(name)}>
                              {(item) => (
                                <div
                                  data-component="commit-review-warning"
                                  data-kind={item.kind}
                                  class="pl-6 text-12-regular"
                                  classList={{
                                    "text-on-critical-base": item.level === "red",
                                    "text-on-warning-base": item.level === "orange",
                                  }}
                                >
                                  {label(item)}
                                </div>
                              )}
                            </For>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                )
              }}
            </For>
          </div>
        </section>

        <section class="flex flex-col gap-1">
          <label class="text-13-medium text-text-strong" for="commit-review-message">
            {language.t("agent.review.message")}
          </label>
          <textarea
            id="commit-review-message"
            data-action="commit-review-message"
            rows={4}
            value={state.message}
            onInput={(event) => setState("message", event.currentTarget.value)}
            placeholder={state.reading ? language.t("agent.review.reading") : language.t("agent.commit.placeholder")}
            class="w-full resize-none rounded-md bg-surface-base border border-border-weak-base px-2 py-1.5 text-12-regular text-text-strong placeholder:text-text-weak outline-none focus:border-border-interactive-base"
          />
        </section>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" disabled={!!state.busy} onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant={props.remote ? "secondary" : "primary"}
            size="large"
            data-action="commit-review-commit"
            disabled={!ready()}
            onClick={() => commit(false)}
          >
            <Show when={state.busy === "commit"}>
              <Spinner class="size-4" />
            </Show>
            {language.t("agent.review.commit")}
          </Button>
          <Show when={props.remote}>
            <Button
              type="button"
              variant="primary"
              size="large"
              data-action="commit-review-push"
              disabled={!ready()}
              onClick={() => commit(true)}
            >
              <Show when={state.busy === "push"}>
                <Spinner class="size-4" />
              </Show>
              {language.t("agent.review.commitPush")}
            </Button>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
