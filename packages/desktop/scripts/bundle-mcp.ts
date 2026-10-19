#!/usr/bin/env bun
/** Copy built mcp-eadpfm into the desktop Tauri resources folder. */
import { $ } from "bun"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, "..")
const dest = join(desktop, "src-tauri", "resources", "mcp-eadpfm")
// The EAD repo is checked out as "EAD_PFM-Editor" on some machines and "EAD_PFM Editor" on others.
const siblings = [
  process.env.EAD_MCP_ROOT,
  ...["EAD_PFM-Editor", "EAD_PFM Editor"].flatMap((repo) => [
    join(desktop, `../../../${repo}/mcp-eadpfm`),
    join(desktop, `../../${repo}/mcp-eadpfm`),
    join(desktop, `../../../../projects_server/${repo}/mcp-eadpfm`),
  ]),
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
