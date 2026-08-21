import { For, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import type { ModalPayload } from "./context-modal"
import { t, type Lang } from "./i18n"

type Job = { jobId?: number; title?: string; description?: string }
type Skill = { title?: string; name?: string; description?: string }

function asJobs(payload: unknown) {
  if (!Array.isArray(payload)) return [] as Job[]
  return payload.flatMap((row) => (row && typeof row === "object" ? [row as Job] : []))
}

function asPrompt(payload: unknown) {
  if (!payload || typeof payload !== "object") return { aiPrompt: "", eadScript: "" }
  const row = payload as { aiPrompt?: string; eadScript?: string }
  return { aiPrompt: row.aiPrompt || "", eadScript: row.eadScript || "" }
}

function asSkills(payload: unknown) {
  if (!Array.isArray(payload)) return [] as Skill[]
  return payload.flatMap((row) => (row && typeof row === "object" ? [row as Skill] : []))
}

function Block(props: { title?: string; children: string }) {
  return (
    <div class="mb-2 last:mb-0">
      <Show when={props.title}>
        <p class="text-12-medium text-text-strong mb-1">{props.title}</p>
      </Show>
      <pre class="text-12-regular whitespace-pre-wrap break-words p-2 rounded-md border border-border-weaker-base bg-background-base">
        {props.children}
      </pre>
    </div>
  )
}

export function ContextDialog(props: {
  title: string
  payload: ModalPayload
  text: string
  lang: Lang
  onInject: (text: string) => Promise<boolean | void> | boolean | void
  onCreate?: (title: string, desc: string) => Promise<void>
}) {
  const dialog = useDialog()
  const [name, setName] = createSignal("")
  const [desc, setDesc] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const copy = async () => {
    await navigator.clipboard.writeText(props.text)
    showToast({ title: "EAD", description: t(props.lang, "copied"), variant: "success" })
  }
  const inject = async () => {
    setBusy(true)
    try {
      const ok = await props.onInject(props.text)
      dialog.close()
      showToast({
        title: "EAD",
        description: t(props.lang, ok === false ? "injected" : "sent"),
        variant: "success",
      })
    } catch (e) {
      showToast({
        title: "EAD",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      })
    } finally {
      setBusy(false)
    }
  }
  const create = async () => {
    const title = name().trim()
    if (!title) {
      showToast({ title: "EAD", description: t(props.lang, "taskRequired"), variant: "error" })
      return
    }
    if (!props.onCreate) return
    setBusy(true)
    try {
      await props.onCreate(title, desc().trim())
      dialog.close()
    } catch (e) {
      showToast({
        title: "EAD",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      })
    } finally {
      setBusy(false)
    }
  }
  const jobs = () => asJobs(props.payload.payload)
  const prompt = () => asPrompt(props.payload.payload)
  const skills = () => asSkills(props.payload.payload)
  return (
    <Dialog
      title={props.title}
      size="large"
      action={
        <div class="flex items-center gap-1">
          <Button size="small" variant="secondary" disabled={busy()} onClick={() => void copy()}>
            {t(props.lang, "copy")}
          </Button>
          <Button size="small" variant="primary" disabled={busy()} onClick={() => void inject()}>
            {t(props.lang, "inject")}
          </Button>
        </div>
      }
    >
      <div class="max-h-[60vh] overflow-y-auto">
        <Show when={props.payload.contextKind === "jobs"}>
          <Show
            when={jobs().length}
            fallback={<p class="text-12-regular text-text-weak">{t(props.lang, "noJobs")}</p>}
          >
            <For each={jobs()}>
              {(job) => (
                <div class="mb-2 pb-2 border-b border-border-weaker-base last:border-b-0">
                  <p class="text-12-medium text-text-strong">{job.title || `Job ${job.jobId || ""}`}</p>
                  <Show when={job.description}>
                    <p class="text-12-regular text-text-weak mt-0.5">{job.description}</p>
                  </Show>
                </div>
              )}
            </For>
          </Show>
          <Show when={props.onCreate}>
            <div class="mt-3 flex flex-col gap-1.5">
              <input
                class="w-full px-2 py-1 rounded-md border border-border-weak-base bg-background-base text-12-regular"
                placeholder={t(props.lang, "taskTitle")}
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
              <textarea
                class="w-full min-h-16 px-2 py-1 rounded-md border border-border-weak-base bg-background-base text-12-regular"
                placeholder={t(props.lang, "taskDesc")}
                value={desc()}
                onInput={(e) => setDesc(e.currentTarget.value)}
              />
              <Button size="small" variant="primary" disabled={busy()} onClick={() => void create()}>
                {t(props.lang, "createTask")}
              </Button>
            </div>
          </Show>
        </Show>
        <Show when={props.payload.contextKind === "prompt"}>
          <Block title={t(props.lang, "aiPromptLabel")}>{prompt().aiPrompt || t(props.lang, "noPrompt")}</Block>
          <Block title={t(props.lang, "eadScriptLabel")}>{prompt().eadScript || t(props.lang, "noScript")}</Block>
        </Show>
        <Show when={props.payload.contextKind === "skills"}>
          <Show
            when={skills().length}
            fallback={<p class="text-12-regular text-text-weak">{t(props.lang, "noSkills")}</p>}
          >
            <For each={skills()}>
              {(skill) => (
                <Block title={skill.title || skill.name || "Skill"}>{skill.description || ""}</Block>
              )}
            </For>
          </Show>
        </Show>
        <Show when={props.payload.contextKind === "api"}>
          <Block>{String(props.payload.payload || "").trim() || t(props.lang, "noApi")}</Block>
        </Show>
        <Show when={props.payload.contextKind === "source"}>
          <Block>{JSON.stringify(props.payload.payload ?? {}, null, 2)}</Block>
        </Show>
      </div>
    </Dialog>
  )
}

export function ConfirmDialog(props: {
  title: string
  message: string
  confirm: string
  onConfirm: () => void
}) {
  const dialog = useDialog()
  return (
    <Dialog
      title={props.title}
      action={
        <Button
          size="small"
          variant="primary"
          onClick={() => {
            dialog.close()
            props.onConfirm()
          }}
        >
          {props.confirm}
        </Button>
      }
    >
      <p class="text-12-regular text-text-weak">{props.message}</p>
    </Dialog>
  )
}
