/** Production EAD endpoints — aligned with Cursor extension v1.0.253. */
export type Env = "production" | "localhost"

/** Cursor extension release this desktop build tracks (EAD_PFM-Editor/cursor-extension). */
export const EAD_CURSOR_EXTENSION_VERSION = "1.0.253"

export const PROD_SERVER = "https://eadfm.com"
export const PROD_API = "https://eadfm.com/api"
export const LOCAL_SERVER = "http://127.0.0.1:5173"
export const LOCAL_API = "http://localhost:8081/api"

export const EAD_MAP_ID = "ead:map"
export const EAD_PILOT_ID = "ead:pilot"

export const EAD_MAP_WIDTH = 320
export const EAD_MAP_MIN = 0
export const EAD_MAP_MAX = 10000

export const EAD_PILOT_WIDTH = 420
export const EAD_PILOT_MIN = 0
export const EAD_PILOT_MAX = 10000

const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
])

/** Cursor plugin proxy ports — production 5190–5195, localhost Vite 5180–5185. */
const PROXY_PORTS = new Set([5180, 5181, 5182, 5183, 5184, 5185, 5190, 5191, 5192, 5193, 5194, 5195])

let env: Env = "production"

export function eadEnv(): Env {
  return env
}

export function applyEnv(next: Env) {
  env = next === "localhost" ? "localhost" : "production"
}

export function eadServer() {
  return env === "localhost" ? LOCAL_SERVER : PROD_SERVER
}

export function eadApi() {
  return env === "localhost" ? LOCAL_API : PROD_API
}

export function eadOrigin() {
  return new URL(eadServer()).origin
}

export function isProxy(origin: string) {
  const url = URL.canParse(origin) ? new URL(origin) : undefined
  if (!url) return false
  if (url.protocol !== "http:") return false
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return false
  return PROXY_PORTS.has(Number(url.port))
}

export function isEadHost(origin: string) {
  if (origin === new URL(PROD_SERVER).origin) return true
  if (LOCAL_ORIGINS.has(origin)) return true
  if (isProxy(origin)) return true
  return origin === eadOrigin()
}

export function frameOrigin(frame?: { src?: string }) {
  const src = frame?.src
  if (!src || !URL.canParse(src)) return eadOrigin()
  return new URL(src).origin
}

export function rewrite(plugin: string, origin: string) {
  const url = new URL(plugin)
  return `${origin.replace(/\/+$/, "")}${url.pathname}${url.search}`
}

function readOrigin(body: unknown) {
  if (!body || typeof body !== "object" || !("origin" in body)) return ""
  const origin = body.origin
  if (typeof origin !== "string") return ""
  return isProxy(origin) ? origin : ""
}

/** Ask OpenCode to start the Cursor-style loopback proxy; fall back to eadfm.com. */
export async function proxyOrigin(host: string, target = eadServer(), auth?: { user?: string; pass?: string }) {
  if (!host) return target
  const url = new URL("/global/ead/plugin-proxy", host)
  url.searchParams.set("target", target)
  const headers: Record<string, string> = {}
  if (auth?.pass) headers.Authorization = `Basic ${btoa(`${auth.user || "opencode"}:${auth.pass}`)}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(4000) }).catch(() => undefined)
  if (!res?.ok) return target
  const body: unknown = await res.json().catch(() => undefined)
  return readOrigin(body) || target
}

/** @deprecated live via eadServer() — kept for tests that pin production. */
export const EAD_SERVER_URL = PROD_SERVER
export const EAD_API_URL = PROD_API
export const EAD_ORIGIN = new URL(PROD_SERVER).origin
