import { eadOrigin } from "./urls"

export const PLAN = "ead"
const NPM = "@ai-sdk/openai-compatible"

type Auth = {
  set: (input: { providerID: string; auth: { type: "api"; key: string } }) => Promise<unknown>
  remove: (input: { providerID: string }) => Promise<unknown>
}

type Save = (config: {
  provider?: Record<string, ReturnType<typeof spec>>
  disabled_providers: string[]
}) => Promise<unknown>

export function gateway() {
  return `${eadOrigin()}/v1`
}

/**
 * A plan as a picker model: `name` is what the gateway routes on, `label` what people see.
 * `context` and `output` are the plan's token limits from Pilot, when it sends them.
 */
export type PlanModel = { name: string; label: string; context?: number; output?: number }

const limit = (plan: PlanModel) =>
  plan.context && plan.output ? { limit: { context: plan.context, output: plan.output } } : {}

/**
 * One model per EAD Dynamic Plan, in the account's order. Config saves merge models, so the
 * whitelist keeps a plan the account no longer holds out of the picker.
 */
export function spec(plans: PlanModel[]) {
  return {
    npm: NPM,
    name: "EAD",
    options: { baseURL: gateway() },
    models: Object.fromEntries(plans.map((plan) => [plan.name, { name: plan.label, ...limit(plan) }])),
    whitelist: plans.map((plan) => plan.name),
  }
}

export function match(cfg: unknown, plans: PlanModel[]) {
  if (!cfg || typeof cfg !== "object") return false
  const row = cfg as {
    npm?: string
    name?: string
    options?: { baseURL?: string }
    models?: Record<string, { name?: string; limit?: { context?: number; output?: number } } | undefined>
    whitelist?: string[]
  }
  if (row.npm !== NPM) return false
  if (row.name !== "EAD") return false
  if (row.options?.baseURL !== gateway()) return false
  const list = row.whitelist ?? []
  if (list.length !== plans.length || plans.some((plan, i) => list[i] !== plan.name)) return false
  return plans.every((plan) => {
    const model = row.models?.[plan.name]
    if (model?.name !== plan.label) return false
    const want = limit(plan).limit
    return want ? model.limit?.context === want.context && model.limit?.output === want.output : !model.limit
  })
}

export async function apply(opts: {
  token: string
  plans: PlanModel[]
  auth: Auth
  save: Save
  cfg?: unknown
  disabled?: string[]
}) {
  const token = opts.token.trim()
  if (!token || opts.plans.length === 0) return
  await opts.auth.set({
    providerID: PLAN,
    auth: { type: "api", key: token },
  })
  const off = opts.disabled ?? []
  if (match(opts.cfg, opts.plans) && !off.includes(PLAN)) return
  await opts.save({
    provider: { [PLAN]: spec(opts.plans) },
    disabled_providers: off.filter((id) => id !== PLAN),
  })
}

export async function drop(opts: { auth: Auth; save: Save; disabled?: string[] }) {
  await opts.auth.remove({ providerID: PLAN }).catch(() => undefined)
  const off = opts.disabled ?? []
  if (off.includes(PLAN)) return
  await opts.save({ disabled_providers: [...off, PLAN] })
}
