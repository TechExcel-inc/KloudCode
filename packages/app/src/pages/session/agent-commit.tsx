import { createMemo, createResource, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Part, VcsFileDiff } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { pushOnly, readOutcome, type GitOutcome } from "./agent-git"
import { DialogCommitReview } from "./agent-commit-review"

const text = (parts: Part[]) =>
  parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
    .replace(/^```[a-z]*\n?|```$/gm, "")
    .trim()

const output = (parts: Part[]) =>
  parts
    .flatMap((part) => {
      if (part.type !== "tool") return []
      if (part.state.status === "completed") return [part.state.output]
      if (part.state.status === "error") return [part.state.error]
      return []
    })
    .join("\n")

export function AgentCommit(props: {
  session?: string
  /** The uncommitted git changes in this folder. */
  diffs: () => VcsFileDiff[]
  /** Files this session's replies changed. */
  sessionFiles?: () => string[]
  /** Called after a commit so the Changes list is re-read. */
  onCommitted?: () => void
  /** Sits inside another box (the Changes box), without its own border. */
  inline?: boolean
}) {
  const sdk = useSDK()
  const language = useLanguage()
  const dialog = useDialog()
  const [state, setState] = createStore({
    mode: "smart" as "smart" | "manual",
    message: "",
    busy: undefined as "push" | undefined,
    done: "",
  })
  const files = createMemo(() => props.diffs().map((diff) => diff.file))
  // Commits on this computer that are not on GitHub yet, re-read whenever the changed files change.
  const [vcs, { refetch }] = createResource(
    () => files().join("\n"),
    () =>
      sdk.client.vcs
        .get()
        .then((res) => res.data)
        .catch(() => undefined),
  )
  const unpushed = () => vcs.latest?.unpushed ?? 0

  // Runs work in a hidden child session so it never shows up in the user's chat.
  const scratch = async <T,>(work: (id: string) => Promise<T>) => {
    const child = await sdk.client.session.create({ parentID: props.session, title: "commit" })
    const id = child.data!.id
    return work(id).finally(() => sdk.client.session.delete({ sessionID: id }).catch(() => undefined))
  }

  const fail = (err: unknown) =>
    showToast({
      variant: "error",
      icon: "circle-ban-sign",
      title: language.t("agent.commit.failed"),
      description: err instanceof Error ? err.message : String(err),
    })

  /** Asks the AI in a hidden session; used by the review dialog for its summary, grouping and message. */
  const ask = (prompt: string) =>
    scratch((id) =>
      sdk.client.session.prompt({
        sessionID: id,
        agent: "plan",
        system:
          "You review uncommitted git changes before a commit. Reply with one JSON object only, exactly in the shape the user asks for. No code fences, no commentary, no tools.",
        parts: [{ type: "text", text: prompt }],
      }),
    ).then((res) => {
      const reply = text(res.data?.parts ?? [])
      if (!reply) throw new Error(language.t("agent.commit.empty"))
      return reply
    })

  /** Runs a git command in a hidden session and reports how far it got. */
  const run = (command: string) =>
    scratch((id) => sdk.client.session.shell({ sessionID: id, agent: "build", command })).then((res) =>
      readOutcome(output(res.data?.parts ?? [])),
    )

  const finish = (outcome: GitOutcome) => {
    void refetch()
    if (outcome.pushed) {
      showToast({ variant: "success", icon: "circle-check", title: language.t("agent.commit.pushedOnly") })
      return
    }
    throw new Error(outcome.log || language.t("agent.commit.failed"))
  }

  /** After the review dialog committed: clear the message, re-read, and say how far it got. */
  const done = (outcome: GitOutcome, subject: string, pushWanted: boolean) => {
    setState({ message: "", done: subject })
    void refetch()
    props.onCommitted?.()
    if (!pushWanted) {
      showToast({ variant: "success", icon: "circle-check", title: language.t("agent.commit.committed") })
      return
    }
    if (outcome.pushed) {
      showToast({ variant: "success", icon: "circle-check", title: language.t("agent.commit.pushed") })
      return
    }
    fail(new Error(`${language.t("agent.commit.notPushed")}\n${outcome.log}`))
  }

  /** Commit never happens in one click: it opens "Review before commit" first, in both modes. */
  const review = () => {
    if (state.busy || files().length === 0) return
    const list = props.diffs()
    dialog.show(() => (
      <DialogCommitReview
        files={list}
        sessionFiles={props.sessionFiles?.() ?? []}
        message={state.mode === "manual" ? state.message : ""}
        remote={!!vcs.latest?.remote_url}
        ask={ask}
        run={run}
        onDone={done}
      />
    ))
  }

  const push = () => {
    if (state.busy) return
    setState("busy", "push")
    void run(pushOnly())
      .then((outcome) => finish(outcome))
      .catch(fail)
      .finally(() => setState("busy", undefined))
  }

  return (
    <div
      data-component="agent-commit"
      class="shrink-0 flex flex-col gap-2"
      classList={{ "px-4 py-3 border-t border-border-weaker-base": !props.inline, "pt-3": props.inline }}
    >
      <Show
        when={files().length > 0}
        fallback={
          <Show
            when={unpushed() > 0 || !!state.busy}
            fallback={
              <Button variant="secondary" size="large" class="w-full" data-action="commit-nothing" disabled>
                {language.t("agent.commit.none")}
              </Button>
            }
          >
            <div class="flex items-center gap-2 min-w-0">
              <Icon name="cloud-upload" size="small" class="shrink-0 text-icon-weak" />
              <span class="flex-1 min-w-0 text-12-regular text-text-base">
                {unpushed() === 1 ? language.t("agent.commit.unpushedOne") : language.t("agent.commit.unpushed", { count: unpushed() })}
              </span>
              <Button variant="primary" size="small" data-action="commit-push" disabled={!!state.busy} onClick={push}>
                <Show when={state.busy === "push"}>
                  <Spinner class="size-3.5" />
                </Show>
                {language.t("agent.commit.push")}
              </Button>
            </div>
          </Show>
        }
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-14-medium text-text-strong">
            <Icon name="branch" size="small" />
            {language.t("agent.commit.title")}
          </div>
          <div class="flex items-center p-0.5 rounded-md bg-surface-base border border-border-weak-base text-12-medium">
            <button
              type="button"
              data-action="commit-mode-manual"
              class="px-2 py-0.5 rounded"
              classList={{
                "bg-surface-raised-base text-text-strong": state.mode === "manual",
                "text-text-weak": state.mode !== "manual",
              }}
              onClick={() => setState("mode", "manual")}
            >
              {language.t("agent.commit.manual")}
            </button>
            <button
              type="button"
              data-action="commit-mode-smart"
              class="px-2 py-0.5 rounded"
              classList={{
                "bg-surface-raised-base text-text-strong": state.mode === "smart",
                "text-text-weak": state.mode !== "smart",
              }}
              onClick={() => setState("mode", "smart")}
            >
              {language.t("agent.commit.smart")}
            </button>
          </div>
        </div>

        <Show when={state.done}>
          <div class="flex items-center gap-1.5 text-12-regular text-text-weak min-w-0">
            <Icon name="circle-check" size="small" class="text-icon-success-base shrink-0" />
            <span class="truncate">{language.t("agent.commit.last", { subject: state.done })}</span>
          </div>
        </Show>

        <Show when={state.mode === "smart"}>
          <div class="text-12-regular text-text-weak">{language.t("agent.commit.hint")}</div>
          <Button
            variant="primary"
            size="large"
            class="w-full"
            data-action="commit-draft"
            disabled={!!state.busy}
            onClick={review}
          >
            <Icon name="brain" size="small" />
            {language.t("agent.commit.draft")}
          </Button>
        </Show>

        <Show when={state.mode === "manual"}>
          <textarea
            data-action="commit-message"
            rows={4}
            value={state.message}
            onInput={(event) => setState("message", event.currentTarget.value)}
            placeholder={language.t("agent.commit.placeholder")}
            class="w-full resize-none rounded-md bg-surface-base border border-border-weak-base px-2 py-1.5 text-12-regular text-text-strong placeholder:text-text-weak outline-none focus:border-border-interactive-base"
          />
          <Button
            variant="primary"
            size="large"
            class="w-full"
            data-action="commit-run"
            disabled={!!state.busy}
            onClick={review}
          >
            {language.t("agent.commit.review", { count: files().length })}
          </Button>
        </Show>
      </Show>
    </div>
  )
}
