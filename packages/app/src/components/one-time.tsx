import { createSignal, For, Show, type JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import type { Session } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { draftText, errorText } from "@/utils/one-time"

export { draftText }

/** A one-session-only model as the picker lists it. */
export type OnceModel = {
  id: string
  name: string
  provider: { id: string; name: string }
  oneSession?: { description?: string; price?: string; limit?: number }
}

type OneTime = NonNullable<Session["oneTime"]>

const fail = (title: string, err: unknown) => showToast({ title, description: errorText(err) })

/** "1 of 3 requests" / "2 requests" for a one-time session. */
function useUsage() {
  const language = useLanguage()
  return (one: OneTime) => {
    const plural = one.requests === 1 ? "one" : "other"
    return one.limit
      ? language.t(`oneTime.banner.usageLimit.${plural}`, { count: one.requests, limit: one.limit })
      : language.t(`oneTime.banner.usage.${plural}`, { count: one.requests })
  }
}

/** The display name of a session's locked model. */
function useModelName() {
  const providers = useProviders()
  return (one: OneTime) =>
    providers.all().find((p) => p.id === one.model.providerID)?.models[one.model.modelID]?.name ?? one.model.modelID
}

/** A small gold "One-time" chip, shared by the picker, banner and sidebar. */
export function OnceTag(props: { closed?: boolean; class?: string }) {
  const language = useLanguage()
  return (
    <span
      data-component="one-time-tag"
      class={`shrink-0 px-1.5 rounded text-11-medium uppercase tracking-wide ${props.class ?? ""}`}
      classList={{
        "bg-surface-warning-weak text-text-on-warning-base": !props.closed,
        "bg-surface-base text-text-weak": props.closed,
      }}
    >
      {props.closed ? language.t("oneTime.tag.closed") : language.t("oneTime.tag")}
    </span>
  )
}

/**
 * Confirms opening a one-time session for a one-session-only model. The current session keeps its model;
 * the new session is locked to this one and remembers where it came from.
 */
export function DialogOneTimeOpen(props: { model: OnceModel; draft: string; onDraftSent: () => void }): JSX.Element {
  const sdk = useSDK()
  const dialog = useDialog()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const [carry, setCarry] = createSignal(!!props.draft)
  const [busy, setBusy] = createSignal(false)
  const info = () => props.model.oneSession ?? {}

  const open = async () => {
    setBusy(true)
    const session = await sdk.client.session.oneTime
      .open({
        originSessionID: params.id || undefined,
        model: { providerID: props.model.provider.id, modelID: props.model.id },
      })
      .then((res) => {
        if (!res.data) throw new Error(language.t("common.requestFailed"))
        return res.data
      })
      .catch((err: unknown) => {
        setBusy(false)
        fail(language.t("oneTime.open.failed"), err)
      })
    if (!session) return
    if (carry() && props.draft) {
      await sdk.client.session
        .promptAsync({ sessionID: session.id, parts: [{ type: "text", text: props.draft }] })
        .then(() => props.onDraftSent())
        .catch((err: unknown) => fail(language.t("oneTime.open.sendFailed"), err))
    }
    dialog.close()
    navigate(`/${params.dir}/session/${session.id}`)
  }

  return (
    <Dialog title={language.t("oneTime.open.title", { model: props.model.name })} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3 max-w-[440px]" data-component="one-time-open">
        <span class="text-14-regular text-text-base">{language.t("oneTime.open.body")}</span>
        <div class="flex flex-col gap-1 text-13-regular text-text-base">
          <Show when={info().description}>
            <span>{info().description}</span>
          </Show>
          <Show when={info().price}>
            <span class="text-text-on-warning-base">{info().price}</span>
          </Show>
          <Show when={info().limit}>
            <span class="text-text-weak">{language.t("oneTime.open.limit", { count: info().limit ?? 0 })}</span>
          </Show>
        </div>
        <Show when={props.draft}>
          <Checkbox checked={carry()} onChange={(value: boolean) => setCarry(value)}>
            {language.t("oneTime.open.carry")}
          </Checkbox>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" data-action="one-time-open" disabled={busy()} onClick={open}>
            {language.t("oneTime.open.confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Asks where to go when a one-time session is done, and whether to carry the result there. */
export function DialogOneTimeDone(props: { session: Session; origin?: Session }): JSX.Element {
  const sdk = useSDK()
  const usage = useUsage()
  const model = useModelName()
  const dialog = useDialog()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const one = () => props.session.oneTime as OneTime
  const [goTo, setGoTo] = createSignal<"origin" | "new">(props.origin ? "origin" : "new")
  const [add, setAdd] = createSignal(true)
  const [busy, setBusy] = createSignal(false)

  const choices = () =>
    [
      props.origin
        ? {
            value: "origin" as const,
            label: language.t("oneTime.done.origin", { title: props.origin.title }),
          }
        : undefined,
      { value: "new" as const, label: language.t("oneTime.done.new") },
    ].filter((item) => !!item)

  const finish = async () => {
    setBusy(true)
    const result = await sdk.client.session.oneTime
      .done({ sessionID: props.session.id, goTo: goTo(), addResult: add() })
      .then((res) => {
        if (!res.data) throw new Error(language.t("common.requestFailed"))
        return res.data
      })
      .catch((err: unknown) => {
        setBusy(false)
        fail(language.t("oneTime.done.failed"), err)
      })
    if (!result) return
    dialog.close()
    if (result.fallback) showToast({ title: language.t("oneTime.done.fallback") })
    navigate(`/${params.dir}/session/${result.targetSessionID}`)
  }

  return (
    <Dialog title={language.t("oneTime.done.title")} fit>
      <div class="flex flex-col gap-3 pl-6 pr-2.5 pb-3 max-w-[440px]" data-component="one-time-done">
        <span class="text-13-regular text-text-weak">
          {language.t("oneTime.done.body", { model: model(one()), usage: usage(one()) })}
        </span>
        <div class="flex flex-col gap-1.5" role="radiogroup">
          <For each={choices()}>
            {(choice) => (
              <button
                type="button"
                role="radio"
                aria-checked={goTo() === choice.value}
                data-action={`one-time-done-${choice.value}`}
                class="text-left px-3 py-2 rounded-md border text-14-regular transition-colors"
                classList={{
                  "border-border-warning-base bg-surface-warning-weak text-text-strong": goTo() === choice.value,
                  "border-border-weak-base text-text-base hover:bg-surface-base-hover": goTo() !== choice.value,
                }}
                onClick={() => setGoTo(choice.value)}
              >
                {choice.label}
              </button>
            )}
          </For>
        </div>
        <Checkbox checked={add()} onChange={(value: boolean) => setAdd(value)}>
          {language.t("oneTime.done.addResult")}
        </Checkbox>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" data-action="one-time-done" disabled={busy()} onClick={finish}>
            {language.t("oneTime.done.confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The bar above the composer in an open one-time session. */
export function OneTimeBanner(props: { session: Session }): JSX.Element {
  const sync = useSync()
  const providers = useProviders()
  const dialog = useDialog()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const one = () => props.session.oneTime as OneTime
  const origin = () => {
    const id = one().originSessionID
    return id ? sync.session.get(id) : undefined
  }
  const model = useModelName()
  const count = useUsage()
  const name = () => model(one())
  const usage = () => count(one())

  return (
    <div
      data-component="one-time-banner"
      class="flex flex-wrap items-center gap-2 px-3 py-2 mb-1 rounded-md border border-border-warning-base bg-surface-warning-weak text-13-regular text-text-strong"
    >
      <OnceTag />
      <span class="min-w-0 truncate">
        <span class="text-13-medium">{name()}</span>
        <span class="text-text-weak"> · {usage()}</span>
      </span>
      <span class="flex-1" />
      <Show when={origin()}>
        {(item) => (
          <Button
            variant="ghost"
            size="small"
            data-action="one-time-back"
            onClick={() => navigate(`/${params.dir}/session/${item().id}`)}
          >
            {language.t("oneTime.banner.back")}
          </Button>
        )}
      </Show>
      <Button
        variant="primary"
        size="small"
        data-action="one-time-finish"
        onClick={() => dialog.show(() => <DialogOneTimeDone session={props.session} origin={origin()} />)}
      >
        {language.t("oneTime.banner.done")}
      </Button>
    </div>
  )
}

/** Shown in place of the composer once a one-time session is closed. */
export function OneTimeClosed(props: {
  session: Session
  /** Still open, but every allowed request is used: point to "Current session done" instead of Reopen. */
  full?: boolean
  ref?: (el: HTMLDivElement) => void
}): JSX.Element {
  const sdk = useSDK()
  const sync = useSync()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = createSignal(false)
  const target = () => {
    const one = props.session.oneTime as OneTime
    const id = one.targetSessionID ?? one.originSessionID
    return id ? sync.session.get(id) : undefined
  }

  const reopen = async () => {
    setBusy(true)
    await sdk.client.session.oneTime
      .reopen({ sessionID: props.session.id })
      .catch((err: unknown) => fail(language.t("oneTime.reopen.failed"), err))
    setBusy(false)
  }

  return (
    <div
      ref={props.ref}
      data-component="one-time-closed"
      class="w-full flex flex-wrap items-center gap-2 rounded-[12px] border border-border-weak-base bg-background-base p-3 text-14-regular text-text-weak"
    >
      <OnceTag closed={!props.full} />
      <span>
        {props.full
          ? language.t("oneTime.full.body", { count: (props.session.oneTime as OneTime).limit ?? 0 })
          : language.t("oneTime.closed.body")}
      </span>
      <span class="flex-1" />
      <Show when={!props.full && target()}>
        {(item) => (
          <Button variant="ghost" size="small" onClick={() => navigate(`/${params.dir}/session/${item().id}`)}>
            {language.t("oneTime.closed.open", { title: item().title })}
          </Button>
        )}
      </Show>
      <Show when={!props.full}>
        <Button variant="secondary" size="small" data-action="one-time-reopen" disabled={busy()} onClick={reopen}>
          {language.t("oneTime.closed.reopen")}
        </Button>
      </Show>
    </div>
  )
}
