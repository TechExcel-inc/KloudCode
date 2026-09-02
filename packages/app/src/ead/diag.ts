export type Step = { name: string; ok: boolean; detail: string }

export type Startup = { text: string; kind: "" | "ok" | "error" }

let steps: Step[] = []
let startup: Startup = { text: "", kind: "" }

export function beginDiag() {
  steps = []
  startup = { text: "", kind: "" }
}

export function noteDiag(name: string, ok: boolean, detail: string) {
  steps = [...steps, { name, ok, detail }]
  startup = { text: `${ok ? "✓" : "✗"} ${name}: ${detail}`, kind: ok ? "" : "error" }
}

export function markStartup(text: string, kind: Startup["kind"] = "") {
  startup = { text, kind }
}

export function readStartup() {
  return startup
}

export function readDiag() {
  return steps
}

export function formatDiag() {
  if (!steps.length) return ""
  return steps.map((s) => `${s.ok ? "ok" : "fail"} ${s.name}: ${s.detail}`).join("\n")
}
