import { createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import type { Part, SnapshotFileDiff, VcsFileDiff } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"

const LIMIT = 24000

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

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

export function AgentCommit(props: { session?: string; diffs: () => (SnapshotFileDiff | VcsFileDiff)[] }) {
  const sdk = useSDK()
  const language = useLanguage()
  const [state, setState] = createStore({
    mode: "smart" as "smart" | "manual",
    message: "",
    busy: undefined as "draft" | "commit" | undefined,
    done: "",
  })
  const files = createMemo(() => props.diffs().map((diff) => diff.file))

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

  const draft = () => {
    if (state.busy || files().length === 0) return
    setState({ busy: "draft", done: "" })
    const diff = props
      .diffs()
      .map((item) => `--- ${item.file} (+${item.additions} -${item.deletions})\n${item.patch ?? ""}`)
      .join("\n")
      .slice(0, LIMIT)
    void scratch((id) =>
      sdk.client.session.prompt({
        sessionID: id,
        agent: "plan",
        system:
          "You write git commit messages. Reply with the commit message only: a concise imperative subject line under 72 characters, optionally followed by a blank line and a short bullet list. No code fences, no commentary, no tools.",
        parts: [{ type: "text", text: `Write a commit message for these changes:\n\n${diff}` }],
      }),
    )
      .then((res) => {
        const message = text(res.data?.parts ?? [])
        if (!message) throw new Error(language.t("agent.commit.empty"))
        setState("message", message)
      })
      .catch(fail)
      .finally(() => setState("busy", undefined))
  }

  const commit = () => {
    const message = state.message.trim()
    if (state.busy || !message || files().length === 0) return
    setState("busy", "commit")
    const paths = files().map(quote).join(" ")
    void scratch((id) =>
      sdk.client.session.shell({
        sessionID: id,
        agent: "build",
        command: `git add -A -- ${paths} && git commit -m ${quote(message)} -- ${paths}`,
      }),
    )
      .then((res) => {
        const log = output(res.data?.parts ?? [])
        if (/fatal:|error:|nothing to commit|nothing added to commit/i.test(log)) throw new Error(log.trim())
        setState({ message: "", done: message.split("\n")[0] ?? "" })
        showToast({ variant: "success", icon: "circle-check", title: language.t("agent.commit.success") })
      })
      .catch(fail)
      .finally(() => setState("busy", undefined))
  }

  return (
    <div data-component="agent-commit" class="shrink-0 flex flex-col gap-2 px-4 py-3 border-t border-border-weaker-base">
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

      <Show when={state.done && files().length > 0}>
        <div class="flex items-center gap-1.5 text-12-regular text-text-weak min-w-0">
          <Icon name="circle-check" size="small" class="text-icon-success-base shrink-0" />
          <span class="truncate">{language.t("agent.commit.last", { subject: state.done })}</span>
        </div>
      </Show>
      <Show
        when={files().length > 0}
        fallback={
          <div class="text-12-regular text-text-weak">
            <Show when={state.done} fallback={language.t("agent.commit.nothing")}>
              {language.t("agent.commit.last", { subject: state.done })}
            </Show>
          </div>
        }
      >
        <Show when={state.mode === "smart" && !state.message}>
          <div class="text-12-regular text-text-weak">{language.t("agent.commit.hint")}</div>
          <Button
            variant="primary"
            size="large"
            class="w-full"
            data-action="commit-draft"
            disabled={!!state.busy}
            onClick={draft}
          >
            <Show when={state.busy === "draft"} fallback={<Icon name="brain" size="small" />}>
              <Spinner class="size-4" />
            </Show>
            {language.t(state.busy === "draft" ? "agent.commit.drafting" : "agent.commit.draft")}
          </Button>
        </Show>

        <Show when={state.mode === "manual" || state.message}>
          <textarea
            data-action="commit-message"
            rows={4}
            value={state.message}
            onInput={(event) => setState("message", event.currentTarget.value)}
            placeholder={language.t("agent.commit.placeholder")}
            class="w-full resize-none rounded-md bg-surface-base border border-border-weak-base px-2 py-1.5 text-12-regular text-text-strong placeholder:text-text-weak outline-none focus:border-border-interactive-base"
          />
          <div class="flex items-center gap-2">
            <Show when={state.mode === "smart"}>
              <Button variant="ghost" size="large" disabled={!!state.busy} onClick={draft}>
                {language.t("agent.commit.redraft")}
              </Button>
            </Show>
            <Button
              variant="primary"
              size="large"
              class="flex-1"
              data-action="commit-run"
              disabled={!!state.busy || !state.message.trim()}
              onClick={commit}
            >
              <Show when={state.busy === "commit"}>
                <Spinner class="size-4" />
              </Show>
              {language.t("agent.commit.run", { count: files().length })}
            </Button>
          </div>
        </Show>
      </Show>
    </div>
  )
}
