import { For, Show, createSignal } from "solid-js"
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
        <p class="text-12-medium mb-1" style={{ color: "#cbd5e1" }}>
          {props.title}
        </p>
      </Show>
      <pre class="context-preview">{props.children}</pre>
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
    <div class="project-cute-popup-backdrop" onClick={() => dialog.close()}>
      <div
        class="context-modal-root"
        style={{ width: "min(100%, 560px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="context-modal-header">
          <div>
            <h3 class="context-modal-title">{props.title}</h3>
            <Show when={props.payload.nodeTitle}>
              <p class="context-modal-meta">
                {props.payload.nodeTitle}
                <Show when={props.payload.updatedAt}>
                  {" • "}
                  {t(props.lang, "contextUpdated")} {props.payload.updatedAt}
                </Show>
              </p>
            </Show>
          </div>
          <button type="button" class="context-modal-close" aria-label={t(props.lang, "contextClose")} onClick={() => dialog.close()}>
            ✕
          </button>
        </div>
        <div class="context-modal-body">
          <Show when={props.payload.contextKind === "jobs"}>
            <Show
              when={jobs().length}
              fallback={<p style={{ color: "#94a3b8", "font-size": "12px" }}>{t(props.lang, "noJobs")}</p>}
            >
              <For each={jobs()}>
                {(job) => (
                  <div class="mb-2 pb-2 last:mb-0 last:pb-0" style={{ "border-bottom": "1px solid rgba(148,163,184,0.15)" }}>
                    <p class="text-12-medium" style={{ color: "#e2e8f0" }}>
                      {job.title || `Job ${job.jobId || ""}`}
                    </p>
                    <Show when={job.description}>
                      <p class="text-12-regular mt-0.5" style={{ color: "#94a3b8" }}>
                        {job.description}
                      </p>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
            <Show when={props.onCreate}>
              <div class="mt-3 flex flex-col gap-1.5">
                <input
                  class="context-input"
                  placeholder={t(props.lang, "taskTitle")}
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                />
                <textarea
                  class="context-textarea"
                  placeholder={t(props.lang, "taskDesc")}
                  value={desc()}
                  onInput={(e) => setDesc(e.currentTarget.value)}
                />
                <button type="button" class="context-btn primary" disabled={busy()} onClick={() => void create()}>
                  {t(props.lang, "createTask")}
                </button>
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
              fallback={<p style={{ color: "#94a3b8", "font-size": "12px" }}>{t(props.lang, "noSkills")}</p>}
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
        <div class="context-modal-actions">
          <button type="button" class="context-btn" disabled={busy()} onClick={() => void copy()}>
            {t(props.lang, "copy")}
          </button>
          <button type="button" class="context-btn primary" disabled={busy()} onClick={() => void inject()}>
            {t(props.lang, "inject")}
          </button>
          <button type="button" class="context-btn" disabled={busy()} onClick={() => dialog.close()}>
            {t(props.lang, "contextClose")}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog(props: {
  title: string
  message: string
  confirm: string
  lang?: Lang
  onConfirm: () => void
}) {
  const dialog = useDialog()
  const lang = () => props.lang || "en"
  return (
    <div class="project-cute-popup-backdrop" onClick={() => dialog.close()}>
      <div class="project-cute-popup" onClick={(e) => e.stopPropagation()}>
        <span class="project-cute-popup-badge">EAD</span>
        <p class="project-cute-popup-title">{props.title}</p>
        <p class="project-cute-popup-text">{props.message}</p>
        <div class="project-cute-popup-actions">
          <button type="button" class="context-btn" onClick={() => dialog.close()}>
            {t(lang(), "cancel")}
          </button>
          <button
            type="button"
            class="context-btn primary"
            onClick={() => {
              dialog.close()
              props.onConfirm()
            }}
          >
            {props.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
