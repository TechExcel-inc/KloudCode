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

/** True for a failed connection (Wi-Fi reconnecting, the Mac waking up) rather than an answer from EAD Pilot. */
export function offline(message: string) {
  return /load failed|failed to fetch|networkerror|network connection|unable to connect|could not connect|timed out|offline/i.test(
    message,
  )
}
