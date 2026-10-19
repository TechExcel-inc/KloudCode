import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { CoworkFail, type Cowork, type CoworkDevice } from "@/ead/cowork"

/**
 * Connects the person's own GitHub account to EAD Pilot with GitHub's device sign-in: CoWork shows
 * a short code, the person approves it on github.com, and Pilot stores the encrypted token.
 */
export function DialogGitHub(props: { api: Cowork; onConnected: () => void }) {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const [device, setDevice] = createSignal<CoworkDevice>()
  const [state, setState] = createSignal<"starting" | "waiting" | "connected" | "expired" | "denied" | "failed">("starting")
  const [message, setMessage] = createSignal("")
  const [login, setLogin] = createSignal("")
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  onCleanup(() => {
    closed = true
    clearTimeout(timer)
  })

  const fail = (err: unknown) => {
    setMessage(err instanceof CoworkFail || err instanceof Error ? err.message : String(err))
    setState("failed")
  }

  const poll = (code: string, wait: number) => {
    timer = setTimeout(async () => {
      if (closed) return
      const result = await props.api.githubFinish(code).catch((err) => {
        fail(err)
        return undefined
      })
      if (!result || closed) return
      if (result.status === "PENDING") return poll(code, Math.max(wait, (result.interval ?? 0) * 1000))
      if (result.status === "CONNECTED") {
        setLogin(result.account?.platformLogin ?? "")
        setState("connected")
        props.onConnected()
        return
      }
      setState(result.status === "EXPIRED" ? "expired" : "denied")
    }, wait)
  }

  const start = async () => {
    clearTimeout(timer)
    setState("starting")
    setCopied(false)
    const next = await props.api.githubStart().catch((err) => {
      fail(err)
      return undefined
    })
    if (!next || closed) return
    setDevice(next)
    setState("waiting")
    poll(next.deviceCode, Math.max(1, next.interval) * 1000)
  }

  onMount(() => void start())

  const copy = () => {
    const code = device()?.userCode
    if (!code) return
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => undefined)
  }

  return (
    <Dialog title={language.t("cowork.github.title")}>
      <div class="dialog-github flex flex-col gap-4 px-4 pb-4 text-13-regular text-text-base select-text">
        <p>{language.t("cowork.github.intro")}</p>
        <Show when={state() === "starting"}>
          <div class="flex items-center gap-2 text-text-weak">
            <Spinner class="size-4" />
          </div>
        </Show>
        <Show when={state() === "waiting" && device()}>
          {(item) => (
            <div class="flex flex-col gap-3">
              <span class="text-text-weak">{language.t("cowork.github.code")}</span>
              <div class="flex items-center gap-3">
                <code data-action="github-user-code" class="text-24-medium tracking-widest text-text-strong">
                  {item().userCode}
                </code>
                <Button variant="ghost" size="small" onClick={copy}>
                  {copied() ? language.t("cowork.github.copied") : language.t("cowork.github.copy")}
                </Button>
              </div>
              <div class="flex items-center gap-3">
                <Button variant="primary" onClick={() => platform.openLink(item().verificationUri)}>
                  {language.t("cowork.github.open")}
                </Button>
                <span class="flex items-center gap-2 text-text-weak">
                  <Spinner class="size-4" />
                  {language.t("cowork.github.waiting")}
                </span>
              </div>
            </div>
          )}
        </Show>
        <Show when={state() === "connected"}>
          <p class="text-text-strong">{language.t("cowork.github.connected", { login: login() })}</p>
          <div>
            <Button variant="primary" onClick={() => dialog.close()}>
              {language.t("common.close")}
            </Button>
          </div>
        </Show>
        <Show when={state() === "expired" || state() === "denied" || state() === "failed"}>
          <p class="text-text-strong">
            {state() === "expired"
              ? language.t("cowork.github.expired")
              : state() === "denied"
                ? language.t("cowork.github.denied")
                : message()}
          </p>
          <div>
            <Button variant="secondary" onClick={() => void start()}>
              {language.t("cowork.github.retry")}
            </Button>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
