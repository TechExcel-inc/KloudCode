import { createStore } from "solid-js/store"

/**
 * The task whose steps the person dismissed (or that finished and closed), per session: the step box and
 * the Active group's "Waiting for you" leave that task out. A new task starts showing again.
 */
const [dismissed, setDismissed] = createStore<Record<string, string | undefined>>({})

export const dismissedSteps = {
  is: (sessionID: string, taskID: string) => dismissed[sessionID] === taskID,
  set: (sessionID: string, taskID: string) => setDismissed(sessionID, taskID),
}
