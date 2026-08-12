import { mcpConfig } from "./mcp"

type Client = {
  mcp: {
    add: (input: {
      name: string
      config: ReturnType<typeof mcpConfig>
    }) => Promise<unknown>
    connect: (input: { name: string }) => Promise<unknown>
  }
}

export async function ensureEadMcp(input: {
  client: Client
  token: string
  entry: string
}) {
  if (!input.token.trim()) throw new Error("Sign in first — MCP needs an auth token")
  if (!input.entry.trim()) throw new Error("MCP entry path is empty")
  await input.client.mcp.add({
    name: "eadpfm",
    config: mcpConfig(input.token, input.entry),
  })
  await input.client.mcp.connect({ name: "eadpfm" }).catch(() => undefined)
}
