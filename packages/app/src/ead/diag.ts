export type Step = { name: string; ok: boolean; detail: string }

let steps: Step[] = []

export function beginDiag() {
  steps = []
}

export function noteDiag(name: string, ok: boolean, detail: string) {
  steps = [...steps, { name, ok, detail }]
}

export function readDiag() {
  return steps
}

export function formatDiag() {
  if (!steps.length) return ""
  return steps.map((s) => `${s.ok ? "ok" : "fail"} ${s.name}: ${s.detail}`).join("\n")
}
