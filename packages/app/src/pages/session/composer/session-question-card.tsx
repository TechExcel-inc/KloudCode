import { Show } from "solid-js"
import type { QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { useSync } from "@/context/sync"
import { SessionProjectDock } from "@/pages/session/composer/session-project-dock"
import { SessionQuestionDock } from "@/pages/session/composer/session-question-dock"
import { projectSwitch } from "@/pages/session/composer/session-project"

/**
 * A question the AI is waiting on, shown in the conversation right after the turn that asked it, so
 * the person can still read what led to it and keep using the input box: a typed message answers it.
 */
export function SessionQuestionCard(props: { request: QuestionRequest; onSubmit: () => void }) {
  const sync = useSync()
  return (
    <div data-component="session-question-card" class="w-full pt-2 pb-6">
      <Show
        when={projectSwitch(props.request, sync.data.part)}
        fallback={<SessionQuestionDock request={props.request} onSubmit={props.onSubmit} />}
      >
        {(target) => <SessionProjectDock request={props.request} target={target()} onSubmit={props.onSubmit} />}
      </Show>
    </div>
  )
}
