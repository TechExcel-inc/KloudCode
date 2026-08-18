#!/usr/bin/env bun
/** Copy built mcp-eadpfm into the desktop Tauri resources folder. */
import { $ } from "bun"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const here = dirname(new URL(import.meta.url).pathname)
const desktop = join(here, "..")
const dest = join(desktop, "src-tauri", "resources", "mcp-eadpfm")
const siblings = [
  join(desktop, "../../../EAD_PFM-Editor/mcp-eadpfm"),
  join(desktop, "../../EAD_PFM-Editor/mcp-eadpfm"),
]
const src = siblings.find((dir) => existsSync(join(dir, "dist", "index.js")))

rmSync(dest, { recursive: true, force: true })
mkdirSync(join(dest, "dist"), { recursive: true })
writeFileSync(join(dest, "package.json"), JSON.stringify({ name: "mcp-eadpfm", private: true }, null, 2))

if (!src) {
  console.warn("mcp-eadpfm not found — skip bundle")
  process.exit(0)
}

await $`cp -R ${join(src, "dist")} ${dest}/`
await $`cp ${join(src, "package.json")} ${dest}/`
if (existsSync(join(src, "node_modules"))) {
  await $`cp -R ${join(src, "node_modules")} ${dest}/`
}
console.log(`bundled MCP -> ${dest}`)
