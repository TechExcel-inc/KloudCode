import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { t, type Lang } from "./i18n"

export function ContextDialog(props: {
  title: string
  text: string
  lang: Lang
  onInject: (text: string) => Promise<void> | void
}) {
  const dialog = useDialog()
  const copy = async () => {
    await navigator.clipboard.writeText(props.text)
    showToast({ title: "EAD", description: t(props.lang, "copied"), variant: "success" })
  }
  const inject = async () => {
    await props.onInject(props.text)
    dialog.close()
    showToast({ title: "EAD", description: t(props.lang, "injected"), variant: "success" })
  }
  return (
    <Dialog
      title={props.title}
      size="large"
      action={
        <div class="flex items-center gap-1">
          <Button size="small" variant="secondary" onClick={() => void copy()}>
            {t(props.lang, "copy")}
          </Button>
          <Button size="small" variant="primary" onClick={() => void inject()}>
            {t(props.lang, "inject")}
          </Button>
        </div>
      }
    >
      <pre class="text-12-regular whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto p-2 rounded-md border border-border-weaker-base bg-background-base">
        {props.text}
      </pre>
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
