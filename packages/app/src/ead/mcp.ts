import { eadApi, eadServer } from "./urls"

/** Empty until Settings / auto-resolve fills a real path. */
export const DEFAULT_MCP_ENTRY = ""

export function mcpCandidates(worktree: string, preferred = "") {
  const root = worktree.replace(/\/+$/, "")
  const parts = root.split("/").filter(Boolean)
  const prefix = root.startsWith("/") ? "/" : ""
  const walked: string[] = []
  for (let i = parts.length; i >= 1; i--) {
    const base = prefix + parts.slice(0, i).join("/")
    walked.push(`${base}/EAD_PFM-Editor/mcp-eadpfm/dist/index.js`)
    walked.push(`${base}/KloudCode/packages/desktop/src-tauri/resources/mcp-eadpfm/dist/index.js`)
    walked.push(`${base}/packages/desktop/src-tauri/resources/mcp-eadpfm/dist/index.js`)
  }
  const list = [
    preferred.trim(),
    `${root}/../EAD_PFM-Editor/mcp-eadpfm/dist/index.js`,
    `${root}/../../EAD_PFM-Editor/mcp-eadpfm/dist/index.js`,
    `${root}/../mcp-eadpfm/dist/index.js`,
    ...walked,
  ]
  const seen = new Set<string>()
  return list.filter((path) => {
    if (!path || seen.has(path)) return false
    seen.add(path)
    return true
  })
}

export function mcpConfig(token: string, entry: string) {
  const api = eadApi().replace(/\/api\/?$/i, "") || "https://eadfm.com"
  return {
    type: "local" as const,
    enabled: true,
    command: ["node", entry],
    environment: {
      EADPFM_API_URL: api,
      EADPFM_API_TOKEN: token,
      EADPFM_TOKEN: token,
      EADPFM_SERVER_URL: eadServer(),
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
