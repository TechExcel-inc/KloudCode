import { createSignal } from "solid-js"

/**
 * The slots next to the task step box above the composer. The reply that owns the steps draws its live
 * lines into them: the current action above the box, helpers, elapsed time and retries below it.
 */
const [above, setAbove] = createSignal<HTMLElement>()
const [below, setBelow] = createSignal<HTMLElement>()

export const stepDockMount = {
  get: () => ({ above: above(), below: below() }),
  setAbove,
  setBelow,
}
