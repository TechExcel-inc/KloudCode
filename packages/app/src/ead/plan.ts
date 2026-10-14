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

export function spec(name: string) {
  return {
    npm: NPM,
    name: "EAD",
    options: { baseURL: gateway() },
    models: { [name]: { name } },
  }
}

export function match(cfg: unknown, name: string) {
  if (!cfg || typeof cfg !== "object") return false
  const row = cfg as {
    npm?: string
    name?: string
    options?: { baseURL?: string }
    models?: Record<string, unknown>
  }
  if (row.npm !== NPM) return false
  if (row.name !== "EAD") return false
  if (row.options?.baseURL !== gateway()) return false
  return Boolean(row.models && name in row.models)
}

export async function apply(opts: {
  token: string
  name: string
  auth: Auth
  save: Save
  cfg?: unknown
  disabled?: string[]
}) {
  const token = opts.token.trim()
  const name = opts.name.trim()
  if (!token || !name) return
  await opts.auth.set({
    providerID: PLAN,
    auth: { type: "api", key: token },
  })
  const off = opts.disabled ?? []
  if (match(opts.cfg, name) && !off.includes(PLAN)) return
  await opts.save({
    provider: { [PLAN]: spec(name) },
    disabled_providers: off.filter((id) => id !== PLAN),
  })
}

export async function drop(opts: { auth: Auth; save: Save; disabled?: string[] }) {
  await opts.auth.remove({ providerID: PLAN }).catch(() => undefined)
  const off = opts.disabled ?? []
  if (off.includes(PLAN)) return
  await opts.save({ disabled_providers: [...off, PLAN] })
}
