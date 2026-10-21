import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { formatTokens } from "./agent-context"
import { costTotals, type CostEntry, type CostItem, type CostStep } from "./agent-cost"

/** The title of a numbered piece of work, as both the Summary and the report show it. */
export function costItemTitle(item: CostItem, t: ReturnType<typeof useLanguage>["t"]) {
  if (item.kind === "other") return t("agent.cost.other")
  if (item.kind === "helper") return t("agent.cost.helper", { title: item.title || t("agent.cost.helperUntitled") })
  return item.title || t("agent.cost.untitled")
}

/** One column layout for the pinned header, group rows and request rows, so every number lines up. */
const GRID = "grid grid-cols-[minmax(0,1fr)_8.5rem_8rem_8rem_8rem_5.5rem] gap-x-2"

/**
 * Every LLM request in a session, by task and step: the model that answered, its input, cached and
 * output tokens, the price used for each, and what each part cost. One header row stays pinned while
 * the list scrolls; each task, step and closed group shows its subtotal in the same columns.
 */
export function AgentCostReport(props: {
  session: string
  items: CostItem[]
  total: number
  untimed: number
  money: (value: number) => string
}) {
  const language = useLanguage()
  const [open, setOpen] = createSignal<Record<number, boolean>>({})
  const isOpen = (item: CostItem) => open()[item.number] ?? props.items.length <= 3
  const count = (value: number) => value.toLocaleString()
  const price = (value?: number | null) => (value == null ? "—" : `${props.money(value)}/M`)
  const part = (value?: number | null) => (value == null ? "—" : props.money(value / 1_000_000))
  const clock = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"
  const seconds = (entry: CostEntry) =>
    entry.startedAt && entry.endedAt
      ? `${Math.max(0, Math.round((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000))}s`
      : language.t("agent.cost.untimed")
  const requests = props.items.reduce((sum, item) => sum + item.entries.length, 0)
  const stepTitle = (step: CostStep) => step.title ?? language.t("agent.cost.noStep")
  const stepHint = (step: CostStep) => step.title ?? language.t("agent.cost.noStepHint")
  /** Token and cost totals of a set of requests, in the four number columns. */
  const totals = (entries: CostEntry[]) => {
    const sum = costTotals(entries)
    return (
      <>
        <span />
        <span class="text-right whitespace-nowrap" title={count(sum.input)}>
          <span class="block">{formatTokens(sum.input)}</span>
          <span class="block text-text-weak">{part(sum.inputCost)}</span>
        </span>
        <span class="text-right whitespace-nowrap" title={count(sum.cached)}>
          <span class="block">{formatTokens(sum.cached)}</span>
          <span class="block text-text-weak">{part(sum.cachedCost)}</span>
        </span>
        <span class="text-right whitespace-nowrap" title={count(sum.output)}>
          <span class="block">{formatTokens(sum.output)}</span>
          <span class="block text-text-weak">{part(sum.outputCost)}</span>
        </span>
        <span class="text-right whitespace-nowrap text-text-strong">{part(sum.cost)}</span>
      </>
    )
  }

  return (
    <Dialog title={language.t("agent.cost.report")} size="x-large">
      <div data-component="agent-cost-report" class="flex-1 min-h-0 flex flex-col gap-2 px-4 pb-4 text-12-regular text-text-base select-text">
        <div class="flex items-baseline gap-2 min-w-0 text-13-regular">
          <span class="shrink-0 text-text-weak">{language.t("agent.cost.session")}</span>
          <span class="min-w-0 truncate text-text-strong" title={props.session}>{props.session}</span>
          <span class="shrink-0 text-text-weak">·</span>
          <span class="shrink-0 text-text-strong">{language.t("agent.cost.total", { cost: props.money(props.total) })}</span>
          <span class="shrink-0 text-text-weak">{language.t("agent.cost.requests", { count: requests })}</span>
        </div>
        <p class="truncate text-text-weak" title={language.t("agent.cost.explain")}>{language.t("agent.cost.explain")}</p>
        <div data-slot="agent-cost-report-list" class="flex-1 min-h-0 overflow-y-auto pr-1">
          <div
            data-slot="agent-cost-report-head"
            class={`${GRID} sticky top-0 z-10 px-3 py-2 border-b border-border-weak-base text-11-regular text-text-weak`}
            style={{ background: "var(--surface-raised-stronger-non-alpha)" }}
          >
            <span>{language.t("agent.cost.col.entries")}</span>
            <span>{language.t("agent.cost.col.model")}</span>
            <span class="text-right">{language.t("agent.cost.col.input")}</span>
            <span class="text-right">{language.t("agent.cost.col.cached")}</span>
            <span class="text-right">{language.t("agent.cost.col.output")}</span>
            <span class="text-right">{language.t("agent.cost.col.cost")}</span>
          </div>
          <div class="flex flex-col gap-2 pt-2">
            <For each={props.items}>
              {(item) => (
                <section data-component="agent-cost-item" class="rounded-md border border-border-weaker-base">
                  <button
                    type="button"
                    class={`${GRID} w-full items-center px-3 py-1.5 text-left text-11-regular text-text-strong hover:bg-surface-base-hover`}
                    aria-expanded={isOpen(item)}
                    onClick={() => setOpen({ ...open(), [item.number]: !isOpen(item) })}
                  >
                    <span class="flex items-center gap-2 min-w-0">
                      <Icon name={isOpen(item) ? "chevron-down" : "chevron-right"} size="small" class="shrink-0 text-icon-weak" />
                      <span class="shrink-0 text-text-weak">#{item.number}</span>
                      <span class="min-w-0 flex flex-col">
                        <span class="truncate text-13-regular" title={costItemTitle(item, language.t)}>
                          {costItemTitle(item, language.t)}
                        </span>
                        <span class="text-text-weak">{language.t("agent.cost.requests", { count: item.entries.length })}</span>
                      </span>
                    </span>
                    {totals(item.entries)}
                  </button>
                  <Show when={isOpen(item)}>
                    <div class="flex flex-col px-3 pb-2 text-11-regular">
                      <For each={item.steps}>
                        {(step) => (
                          <>
                            <div class={`${GRID} items-center py-1.5 border-t border-border-weak-base text-text-strong`}>
                              <span class="min-w-0 truncate pl-6" title={stepHint(step)}>
                                {stepTitle(step)} · {language.t("agent.cost.requests", { count: step.entries.length })}
                              </span>
                              {totals(step.entries)}
                            </div>
                            <For each={step.entries}>
                              {(entry) => (
                                <div class={`${GRID} items-start py-1 border-t border-border-weaker-base`}>
                                  <span class="pl-6 whitespace-nowrap">
                                    <span class="block text-text-strong">
                                      {entry.startedAt
                                        ? clock(entry.startedAt)
                                        : language.t("agent.cost.finished", { time: clock(entry.endedAt) })}
                                    </span>
                                    <span class="block text-text-weak">{seconds(entry)}</span>
                                  </span>
                                  <span class="min-w-0" title={`${entry.providerId} / ${entry.modelId}`}>
                                    <span class="block truncate text-text-strong">{entry.modelId}</span>
                                    <span class="block text-text-weak">{entry.slotKey}</span>
                                  </span>
                                  <span class="text-right whitespace-nowrap" title={count(entry.promptTokens - entry.cachedTokens)}>
                                    <span class="block text-text-strong">{formatTokens(entry.promptTokens - entry.cachedTokens)}</span>
                                    <span class="block text-text-weak">
                                      {price(entry.inputPerMillion)} · {part(entry.inputCostMicroUsd)}
                                    </span>
                                  </span>
                                  <span class="text-right whitespace-nowrap" title={count(entry.cachedTokens)}>
                                    <span class="block text-text-strong">{formatTokens(entry.cachedTokens)}</span>
                                    <span class="block text-text-weak">
                                      {price(entry.cachedInputPerMillion)} · {part(entry.cachedCostMicroUsd)}
                                    </span>
                                  </span>
                                  <span class="text-right whitespace-nowrap" title={count(entry.completionTokens)}>
                                    <span class="block text-text-strong">{formatTokens(entry.completionTokens)}</span>
                                    <span class="block text-text-weak">
                                      {price(entry.outputPerMillion)} · {part(entry.outputCostMicroUsd)}
                                    </span>
                                  </span>
                                  <span class="text-right whitespace-nowrap text-text-strong">
                                    {entry.costMicroUsd == null ? language.t("agent.summary.notPriced") : part(entry.costMicroUsd)}
                                  </span>
                                </div>
                              )}
                            </For>
                          </>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              )}
            </For>
            <div
              data-slot="agent-cost-report-total"
              class={`${GRID} items-center px-3 py-2 border-t-2 border-border-weak-base text-11-regular text-text-strong`}
            >
              <span class="text-13-medium">
                {language.t("agent.cost.grandTotal")} · {language.t("agent.cost.requests", { count: requests })}
              </span>
              {totals(props.items.flatMap((item) => item.entries))}
            </div>
            <Show when={props.untimed > 0}>
              <p class="text-text-weak">{language.t("agent.summary.untimed", { count: props.untimed })}</p>
            </Show>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
