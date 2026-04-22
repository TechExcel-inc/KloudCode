import { createSimpleContext } from "@opencode-ai/ui/context"
import { createStore } from "solid-js/store"
import { createMemo, type Accessor, type Component } from "solid-js"

export type PluginPanelProps = {
  sessionKey: Accessor<string>
  width: Accessor<number>
}

export type PluginPanelDefinition = {
  id: string
  title: string
  icon: string
  component: Component<PluginPanelProps>
  defaultOpen?: boolean
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  order?: number
}

export type PluginPanelEntry = PluginPanelDefinition & {}

type PanelRegistration = {
  entry: PluginPanelEntry
  unregister: () => void
}

export const { use: usePluginRegistry, provider: PluginRegistryProvider } = createSimpleContext({
  name: "PluginRegistry",
  init: () => {
    const [store, setStore] = createStore({
      registrations: [] as PanelRegistration[],
    })

    const panels = {
      register(definition: PluginPanelDefinition): () => void {
        const existing = store.registrations.find((r) => r.entry.id === definition.id)
        if (existing) return existing.unregister

        const entry: PluginPanelEntry = { ...definition }
        let removed = false
        const unregister = () => {
          if (removed) return
          removed = true
          setStore("registrations", (regs) => regs.filter((r) => r.entry.id !== entry.id))
        }

        setStore("registrations", (regs) => [...regs, { entry, unregister }])
        return unregister
      },

      list(): Accessor<PluginPanelEntry[]> {
        return createMemo(() =>
          store.registrations
            .map((r) => r.entry)
            .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
        )
      },

      get(id: string): PluginPanelEntry | undefined {
        return store.registrations.find((r) => r.entry.id === id)?.entry
      },
    }

    return { panels }
  },
})
