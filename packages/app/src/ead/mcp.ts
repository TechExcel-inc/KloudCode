import { EAD_API_URL, EAD_SERVER_URL } from "./urls"

/** Empty until Settings / auto-resolve fills a real path. */
export const DEFAULT_MCP_ENTRY = ""

export function mcpCandidates(worktree: string, preferred = "") {
  const root = worktree.replace(/\/+$/, "")
  const list = [
    preferred.trim(),
    `${root}/../EAD_PFM-Editor/mcp-eadpfm/dist/index.js`,
    `${root}/../../EAD_PFM-Editor/mcp-eadpfm/dist/index.js`,
    `${root}/../mcp-eadpfm/dist/index.js`,
  ]
  const seen = new Set<string>()
  return list.filter((path) => {
    if (!path || seen.has(path)) return false
    seen.add(path)
    return true
  })
}

export function mcpConfig(token: string, entry: string) {
  const api = EAD_API_URL.replace(/\/api\/?$/i, "") || "https://eadfm.com"
  return {
    type: "local" as const,
    enabled: true,
    command: ["node", entry],
    environment: {
      EADPFM_API_URL: api,
      EADPFM_API_TOKEN: token,
      EADPFM_TOKEN: token,
      EADPFM_SERVER_URL: EAD_SERVER_URL,
    },
  }
}

/** MCP snippet for opencode.json — desktop will auto-patch via SDK mcp.add. */
export function mcpSnippet(token: string, entry = DEFAULT_MCP_ENTRY) {
  return {
    mcp: {
      eadpfm: mcpConfig(token, entry),
    },
  }
}
