import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { useNavigate, useParams } from "@solidjs/router"
import type { JSX } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { runStopSteps, type SessionAttention, stopSteps } from "./active-sessions"

type Cause = Exclude<SessionAttention["cause"], undefined>

// Where the thing to act on lives once the session is on screen.
const targets: Record<Exclude<Cause, "unfinished">, string> = {
  question: '[data-component="session-question-card"]',
  permission: '[data-component="dock-prompt"][data-kind="permission"]',
  steps: '[data-action="session-todo-continue"]',
}

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex="0"]'

/**
 * Brings the pending question, permission request or step choice into view and focuses it. The session may
 * have just been opened, so it waits a few seconds for the card to appear.
 */
export function revealAttention(cause: Exclude<Cause, "unfinished">) {
  const selector = targets[cause]
  const until = Date.now() + 3000
  const step = () => {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) {
      if (Date.now() < until) requestAnimationFrame(step)
      return
    }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" })
    const focus = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE)
    focus?.focus({ preventScroll: true })
  }
  requestAnimationFrame(step)
}

/**
 * What clicking the dot does: a question, permission or step choice opens the session (when it is not the
 * one on screen) and brings that card into view; a stuck reply stops the session, which closes the reply.
 */
export function useAttentionAction() {
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()

  return (session: { id: string; directory: string }, attention: SessionAttention) => {
    if (attention.kind === "working") return
    const directory = session.directory
    if (attention.cause === "unfinished") {
      const [store] = globalSync.child(directory, { bootstrap: false })
      void runStopSteps(stopSteps({ ...store, directory }, session.id), {
        rejectPermission: (requestID) => globalSDK.client.permission.reply({ requestID, directory, reply: "reject" }),
        rejectQuestion: (requestID) => globalSDK.client.question.reject({ requestID, directory }),
        abort: (sessionID) => globalSDK.client.session.abort({ sessionID, directory }),
      }).catch((err: unknown) =>
        showToast({
          title: language.t("agent.sessions.stopFailed"),
          description: err instanceof Error ? err.message : "",
        }),
      )
      return
    }
    if (params.id !== session.id) navigate(`/${base64Encode(directory)}/session/${session.id}`)
    revealAttention(attention.cause)
  }
}

/**
 * A small static dot for a session that needs the person: orange while it waits on them, red when its
 * reply got stuck. Hovering tells why and what a click does; clicking does it.
 */
export function SessionAttentionDot(props: {
  attention: SessionAttention
  onActivate: () => void
  placement?: "top" | "bottom" | "left" | "right"
  class?: string
}): JSX.Element {
  const language = useLanguage()
  const cause = () => props.attention.cause ?? "unfinished"
  const text = () => language.t(`agent.attention.${cause()}`)
  const action = () => language.t(`agent.attention.action.${cause()}`)
  const activate = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    props.onActivate()
  }

  return (
    <Tooltip
      placement={props.placement ?? "bottom"}
      gutter={6}
      value={
        <div class="flex flex-col gap-0.5 max-w-64">
          <span>{text()}</span>
          <span class="text-text-weak">{action()}</span>
        </div>
      }
    >
      <span
        role="button"
        tabIndex={0}
        data-component="session-attention-dot"
        data-kind={props.attention.kind}
        data-cause={cause()}
        aria-label={`${text()} ${action()}`}
        class={`shrink-0 size-4 flex items-center justify-center rounded-full cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border-interactive-base ${props.class ?? ""}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") activate(event)
        }}
      >
        <span
          class="size-2 rounded-full"
          classList={{
            "bg-surface-warning-strong": props.attention.kind === "waiting",
            "bg-icon-critical-base": props.attention.kind === "stuck",
          }}
        />
      </span>
    </Tooltip>
  )
}
