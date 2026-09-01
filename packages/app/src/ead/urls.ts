/** Production EAD endpoints — aligned with Cursor extension v1.0.201 production VSIX. */
export type Env = "production" | "localhost"

/** Cursor extension release this desktop build tracks (EAD_PFM-Editor/cursor-extension). */
export const EAD_CURSOR_EXTENSION_VERSION = "1.0.201"

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

export function isEadHost(origin: string) {
  if (origin === new URL(PROD_SERVER).origin) return true
  if (LOCAL_ORIGINS.has(origin)) return true
  return origin === eadOrigin()
}

/** @deprecated live via eadServer() — kept for tests that pin production. */
export const EAD_SERVER_URL = PROD_SERVER
export const EAD_API_URL = PROD_API
export const EAD_ORIGIN = new URL(PROD_SERVER).origin
