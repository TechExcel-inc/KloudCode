import { createSignal } from "solid-js"

// The layout owns project switching (it restores the last session); the title bar menu calls into it.
const [actions, setActions] = createSignal<{ go: (directory: string) => void; choose: () => void }>()

export const projectActions = actions
export const setProjectActions = setActions
