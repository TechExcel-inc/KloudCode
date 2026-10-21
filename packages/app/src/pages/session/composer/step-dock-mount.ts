import { createSignal } from "solid-js"

/**
 * The slot below the task step box above the composer. The reply that owns the steps draws its live line
 * into it: the current action, elapsed time and helpers, and any retry notice.
 */
const [below, setBelow] = createSignal<HTMLElement>()

export const stepDockMount = {
  get: () => ({ below: below() }),
  setBelow,
}
