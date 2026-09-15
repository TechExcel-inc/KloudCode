import { eadHttp } from "./http"
import { eadApi } from "./urls"

type Http = typeof fetch

const NEXT = "You need to perform AI Improve EAD and PFM first."
const MISS = "EAD Script not found."
const BAD = "EAD Script is not valid."
const SRC = "Linked Source Code not found."
const SPEC = "API Spec not found."

function headers(token: string) {
  return { Accept: "application/json", Authorization: `Bearer ${token}` }
}

async function json(http: Http, path: string, token: string) {
  const res = await http(`${eadApi()}${path}`, { headers: headers(token) }).catch(() => undefined)
  if (!res?.ok) return
  const text = await res.text()
  if (!text.trim()) return
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return
  }
}

function script(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return ""
  try {
    const obj = JSON.parse(raw) as { script?: unknown }
    if (typeof obj.script === "string") return obj.script.trim()
  } catch {
    /* raw */
  }
  return raw.includes("[") || /Feature\s*\d+/i.test(raw) ? raw.trim() : ""
}

export function lined(text: string) {
  const s = text.trim()
  if (!s || s.length < 280) return false
  const features = s.split("\n").filter((l) => /^\s*(?:#+\s*)?Feature\s*\d+/i.test(l)).length
  if (features < 3) return false
  let n = 0
  for (const raw of s.split("\n")) {
    const t = raw.trim()
    if (!t || t.startsWith("//") || /^\s*(?:#+\s*)?Feature\s*\d+/i.test(t)) continue
    const arrow = t.includes("→") || t.includes("↔") || /\s->\s/.test(t)
    const action = t.includes("{") && t.includes("}")
    const entity = t.includes("[")
    if (arrow && action && entity) n += 1
  }
  return n >= 6
}

function paths(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return []
  const t = raw.trim()
  if (t.startsWith("[")) {
    try {
      const parsed = JSON.parse(t) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())
    } catch {
      return []
    }
  }
  return t
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function apis(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return 0
  try {
    const obj = JSON.parse(raw) as { apis?: unknown }
    if (Array.isArray(obj.apis)) return obj.apis.length
  } catch {
    /* envelope */
  }
  return raw.trim().length > 40 ? 1 : 0
}

/** Cursor 1.0.238 Improve Test Cases host gate — fail closed before injecting the playbook. */
export async function precheck(
  token: string,
  nid: number | null,
  eid: number | null,
  http: Http = eadHttp(),
): Promise<{ reason: string; failures: string[] } | undefined> {
  if (!token.trim()) return { reason: `${MISS} ${NEXT}`, failures: [MISS] }
  const fails: string[] = []
  let body = ""
  if (eid != null && eid > 0) {
    const row = await json(http, `/ead/entities/${eid}`, token)
    body = script(row?.scriptJson)
  } else if (nid != null && nid > 0) {
    const row = await json(http, `/ead/nodes/${nid}/entities/latest`, token)
    body = script(row?.scriptJson)
  }
  if (!body) fails.push(MISS)
  else if (!lined(body)) fails.push(BAD)

  if (nid != null && nid > 0) {
    const node = await json(http, `/nodes/${nid}`, token)
    if (!node || paths(node.sourceCodeFiles).length === 0) fails.push(SRC)
    const prompt = await json(http, `/v1/ai-api/prompt/${nid}`, token)
    if (!prompt || apis(prompt.promptContent) === 0) fails.push(SPEC)
  }

  if (fails.length === 0) return
  return { reason: `${fails.join(" ")} ${NEXT}`, failures: fails }
}
