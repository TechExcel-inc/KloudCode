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

/**
 * Every AI request in a session, by task and step: the model that answered, its input, cached and
 * output tokens, the price used for each, and what each part cost.
 */
export function AgentCostReport(props: { items: CostItem[]; total: number; untimed: number; money: (value: number) => string }) {
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
  /** Totals of a set of requests, laid out in the same columns as the requests. */
  const subtotal = (label: string, entries: CostEntry[]) => {
    const sum = costTotals(entries)
    return (
      <tr class="border-t-2 border-border-weak-base text-text-strong">
        <td class="py-1 pr-2" colspan="2">
          {label} · {language.t("agent.cost.requests", { count: entries.length })}
        </td>
        <td class="py-1 pr-2 text-right whitespace-nowrap" title={count(sum.input)}>
          <div>{formatTokens(sum.input)}</div>
          <div class="text-text-weak">{part(sum.inputCost)}</div>
        </td>
        <td class="py-1 pr-2 text-right whitespace-nowrap" title={count(sum.cached)}>
          <div>{formatTokens(sum.cached)}</div>
          <div class="text-text-weak">{part(sum.cachedCost)}</div>
        </td>
        <td class="py-1 pr-2 text-right whitespace-nowrap" title={count(sum.output)}>
          <div>{formatTokens(sum.output)}</div>
          <div class="text-text-weak">{part(sum.outputCost)}</div>
        </td>
        <td class="py-1 text-right whitespace-nowrap">{part(sum.cost)}</td>
      </tr>
    )
  }

  return (
    <Dialog title={language.t("agent.cost.report")} size="x-large">
      <div data-component="agent-cost-report" class="flex-1 min-h-0 flex flex-col gap-3 px-4 pb-4 text-12-regular text-text-base select-text">
        <div class="flex items-baseline gap-3 text-13-regular">
          <span class="text-text-strong">{language.t("agent.cost.total", { cost: props.money(props.total) })}</span>
          <span class="text-text-weak">{language.t("agent.cost.requests", { count: requests })}</span>
        </div>
        <p class="truncate text-text-weak" title={language.t("agent.cost.explain")}>{language.t("agent.cost.explain")}</p>
        <div data-slot="agent-cost-report-list" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1">
        <For each={props.items}>
          {(item) => (
            <section data-component="agent-cost-item" class="rounded-md border border-border-weaker-base">
              <button
                type="button"
                class="w-full flex items-center gap-2 px-3 h-9 text-left hover:bg-surface-base-hover"
                aria-expanded={isOpen(item)}
                onClick={() => setOpen({ ...open(), [item.number]: !isOpen(item) })}
              >
                <Icon name={isOpen(item) ? "chevron-down" : "chevron-right"} size="small" class="text-icon-weak" />
                <span class="text-text-weak">#{item.number}</span>
                <span class="min-w-0 truncate text-13-regular text-text-strong">{costItemTitle(item, language.t)}</span>
                <span class="ml-auto shrink-0 text-text-weak">{language.t("agent.cost.requests", { count: item.entries.length })}</span>
                <span class="shrink-0 w-20 text-right text-text-strong">{props.money(item.cost)}</span>
              </button>
              <Show when={isOpen(item)}>
                <div class="flex flex-col gap-2 px-3 pb-3">
                  <For each={item.steps}>
                    {(step) => (
                      <div class="flex flex-col">
                        <div class="flex items-center gap-2 py-1 border-b border-border-weaker-base">
                          <span class="min-w-0 truncate text-text-strong" title={stepHint(step)}>
                            {stepTitle(step)}
                          </span>
                          <span class="ml-auto shrink-0 text-text-strong">{props.money(step.cost)}</span>
                        </div>
                        <table class="w-full text-11-regular">
                          <thead class="text-text-weak">
                            <tr class="text-left">
                              <th class="font-normal py-1 pr-2">{language.t("agent.cost.col.time")}</th>
                              <th class="font-normal py-1 pr-2">{language.t("agent.cost.col.model")}</th>
                              <th class="font-normal py-1 pr-2 text-right">{language.t("agent.cost.col.input")}</th>
                              <th class="font-normal py-1 pr-2 text-right">{language.t("agent.cost.col.cached")}</th>
                              <th class="font-normal py-1 pr-2 text-right">{language.t("agent.cost.col.output")}</th>
                              <th class="font-normal py-1 text-right">{language.t("agent.cost.col.cost")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={step.entries}>
                              {(entry) => (
                                <tr class="align-top border-t border-border-weaker-base">
                                  <td class="py-1 pr-2 whitespace-nowrap">
                                    <div class="text-text-strong">
                                      {entry.startedAt
                                        ? clock(entry.startedAt)
                                        : language.t("agent.cost.finished", { time: clock(entry.endedAt) })}
                                    </div>
                                    <div class="text-text-weak">{seconds(entry)}</div>
                                  </td>
                                  <td class="py-1 pr-2" title={`${entry.providerId} / ${entry.modelId}`}>
                                    <div class="text-text-strong">{entry.modelId}</div>
                                    <div class="text-text-weak">{entry.slotKey}</div>
                                  </td>
                                  <td class="py-1 pr-2 text-right whitespace-nowrap" title={count(entry.promptTokens - entry.cachedTokens)}>
                                    <div class="text-text-strong">{formatTokens(entry.promptTokens - entry.cachedTokens)}</div>
                                    <div class="text-text-weak">
                                      {price(entry.inputPerMillion)} · {part(entry.inputCostMicroUsd)}
                                    </div>
                                  </td>
                                  <td class="py-1 pr-2 text-right whitespace-nowrap" title={count(entry.cachedTokens)}>
                                    <div class="text-text-strong">{formatTokens(entry.cachedTokens)}</div>
                                    <div class="text-text-weak">
                                      {price(entry.cachedInputPerMillion)} · {part(entry.cachedCostMicroUsd)}
                                    </div>
                                  </td>
                                  <td class="py-1 pr-2 text-right whitespace-nowrap" title={count(entry.completionTokens)}>
                                    <div class="text-text-strong">{formatTokens(entry.completionTokens)}</div>
                                    <div class="text-text-weak">
                                      {price(entry.outputPerMillion)} · {part(entry.outputCostMicroUsd)}
                                    </div>
                                  </td>
                                  <td class="py-1 text-right whitespace-nowrap text-text-strong">
                                    {entry.costMicroUsd == null ? language.t("agent.summary.notPriced") : part(entry.costMicroUsd)}
                                  </td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                          <tfoot>{subtotal(language.t("agent.cost.stepTotal"), step.entries)}</tfoot>
                        </table>
                      </div>
                    )}
                  </For>
                  <Show when={item.steps.length > 1}>
                    <table class="w-full text-11-regular">
                      <tbody>{subtotal(language.t("agent.cost.itemTotal", { number: item.number }), item.entries)}</tbody>
                    </table>
                  </Show>
                </div>
              </Show>
            </section>
          )}
        </For>
        <Show when={props.untimed > 0}>
          <p class="text-text-weak">{language.t("agent.summary.untimed", { count: props.untimed })}</p>
        </Show>
        </div>
      </div>
    </Dialog>
  )
}
