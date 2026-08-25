import type { Platform } from "@/context/platform"

type Http = typeof fetch

let platform: Platform | undefined

/** Call once from EadProvider so all EAD API calls use Tauri-safe fetch on desktop. */
export function bindEadHttp(next: Platform) {
  platform = next
}

export function eadHttp(): Http {
  if (platform?.platform === "desktop") {
    if (!platform.fetch) throw new Error("EAD requests require the desktop HTTP plugin")
    return platform.fetch
  }
  return platform?.fetch ?? globalThis.fetch.bind(globalThis)
}
