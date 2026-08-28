import { mcpCandidates, mcpConfig } from "./mcp"

type Client = {
  mcp: {
    add: (input: {
      name: string
      config: ReturnType<typeof mcpConfig>
    }) => Promise<unknown>
    connect: (input: { name: string }) => Promise<unknown>
  }
  file?: {
    read: (input: { path: string }) => Promise<{ data?: unknown; error?: unknown }>
  }
}

function normalize(path: string) {
  const parts = path.replace(/\\/g, "/").split("/")
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") {
        out.pop()
        continue
      }
    }
    out.push(part)
  }
  const joined = out.join("/")
  return path.startsWith("/") ? `/${joined}` : joined
}

export async function resolveMcpEntry(
  preferred: string,
  worktree: string,
  probe?: (path: string) => Promise<boolean>,
) {
  const list = mcpCandidates(worktree, preferred).map(normalize)
  if (!probe) return list[0] || ""
  for (const path of list) {
    if (await probe(path)) return path
  }
  return list[0] || ""
}

export async function ensureEadMcp(input: {
  client: Client
  token: string
  entry: string
  worktree?: string
}) {
  if (!input.token.trim()) throw new Error("Sign in first — MCP needs an auth token")
  const probe = input.client.file
    ? async (path: string) => {
        const res = await input.client.file!.read({ path }).catch(() => undefined)
        return Boolean(res && !res.error && res.data !== undefined)
      }
    : undefined
  const entry = input.worktree
    ? await resolveMcpEntry(input.entry, input.worktree, probe)
    : input.entry.trim()
  if (!entry) throw new Error("MCP entry path is empty — set it in Settings → EAD Pilot")
  // mcp.add already starts the server; connect() only reloads from opencode.json and would log
  // "MCP config not found or invalid" for runtime-only registrations.
  await input.client.mcp.add({
    name: "eadpfm",
    config: mcpConfig(input.token, entry, input.worktree ?? ""),
  })
  return entry
}

export async function clearEadMcp(input: {
  client: Client
  entry: string
  worktree?: string
}) {
  const probe = input.client.file
    ? async (path: string) => {
        const res = await input.client.file!.read({ path }).catch(() => undefined)
        return Boolean(res && !res.error && res.data !== undefined)
      }
    : undefined
  const entry = input.worktree
    ? await resolveMcpEntry(input.entry, input.worktree, probe)
    : input.entry.trim()
  if (!entry) return ""
  await input.client.mcp.add({
    name: "eadpfm",
    config: mcpConfig("", entry, input.worktree ?? ""),
  })
  return entry
}
