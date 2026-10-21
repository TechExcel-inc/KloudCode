import { createSignal, For } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"

/** Asks before putting one reply's changed files back to how they were before that reply. */
export function DialogDiscardChanges(props: { sessionID: string; messageID: string; files: string[] }) {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useSDK()
  const [busy, setBusy] = createSignal(false)

  const fail = (err: unknown) =>
    showToast({
      variant: "error",
      icon: "circle-ban-sign",
      title: language.t("session.discard.failed"),
      description: err instanceof Error ? err.message : String(err),
    })

  const run = () => {
    if (busy()) return
    setBusy(true)
    void sdk.client.session
      .discard({ sessionID: props.sessionID, messageID: props.messageID, files: props.files })
      .then((res) => {
        if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no response"))
        dialog.close()
        const refused = res.data.refused.length
        if (res.data.discarded.length === 0) {
          fail(new Error(language.t("session.discard.refused", { count: refused })))
          return
        }
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.discard.done"),
          description: refused > 0 ? language.t("session.discard.refused", { count: refused }) : undefined,
        })
      })
      .catch(fail)
      .finally(() => setBusy(false))
  }

  return (
    <Dialog title={language.t("session.discard.title")} class="w-full max-w-[480px] mx-auto">
      <div data-component="dialog-discard-changes" class="flex flex-col gap-4 px-6 pb-6">
        <p class="text-13-regular text-text-base">{language.t("session.discard.body")}</p>
        <ul class="max-h-56 overflow-y-auto flex flex-col gap-1 rounded-md border border-border-weak-base p-2">
          <For each={props.files}>
            {(file) => (
              <li class="min-w-0 truncate text-12-mono text-text-strong select-text" title={file}>
                {getFilename(file)}
                <span class="text-text-weak"> {getDirectory(file)}</span>
              </li>
            )}
          </For>
        </ul>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" disabled={busy()} onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="button" variant="primary" size="large" data-action="discard-confirm" disabled={busy()} onClick={run}>
            {busy() ? <Spinner class="size-4" /> : null}
            {language.t("session.discard.confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
