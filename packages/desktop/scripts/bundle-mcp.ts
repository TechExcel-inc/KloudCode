#!/usr/bin/env bun
/** Copy built mcp-eadpfm into the desktop Tauri resources folder. */
import { $ } from "bun"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, "..")
const dest = join(desktop, "src-tauri", "resources", "mcp-eadpfm")
const siblings = [
  process.env.EAD_MCP_ROOT,
  join(desktop, "../../../EAD_PFM-Editor/mcp-eadpfm"),
  join(desktop, "../../EAD_PFM-Editor/mcp-eadpfm"),
  join(desktop, "../../../../projects_server/EAD_PFM-Editor/mcp-eadpfm"),
].filter((dir): dir is string => Boolean(dir))

const src = siblings.find((dir) => existsSync(join(dir, "dist", "index.js")))

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

if (!src) {
  const hint = siblings.map((dir) => `  - ${dir}`).join("\n")
  throw new Error(
    `mcp-eadpfm not built. Run npm install && npm run build in EAD_PFM-Editor/mcp-eadpfm\nChecked:\n${hint}`,
  )
}

await $`cp -R ${join(src, "dist")} ${join(dest, "dist")}`
await $`cp ${join(src, "package.json")} ${dest}/`
if (existsSync(join(src, "node_modules"))) {
  await $`cp -R ${join(src, "node_modules")} ${dest}/`
}
console.log(`bundled MCP -> ${dest}`)
