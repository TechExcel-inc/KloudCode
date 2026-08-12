import type { Platform } from "@/context/platform"

type Http = typeof fetch

let http: Http = globalThis.fetch.bind(globalThis)

/** Call once from EadProvider so all EAD API calls use Tauri-safe fetch on desktop. */
export function bindEadHttp(platform: Platform) {
  http = platform.fetch ?? globalThis.fetch.bind(globalThis)
}

export function eadHttp(): Http {
  return http
}
