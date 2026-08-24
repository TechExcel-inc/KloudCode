import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE

if (process.platform === "win32") {
  await $`taskkill /F /IM opencode-cli.exe`.nothrow()
  await $`taskkill /F /IM opencode-desktop.exe`.nothrow()
  await $`taskkill /F /IM OpenCode.exe`.nothrow()
}

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binaryPath = windowsify(`../opencode/dist/${sidecarConfig.ocBinary}/bin/opencode`)
const dest = windowsify(`src-tauri/sidecars/opencode-cli-${RUST_TARGET}`)
const rebuild = Bun.env.OPENCODE_REBUILD_SIDECAR === "1"

await $`bun ./scripts/bundle-mcp.ts`

if (!rebuild && (await Bun.file(dest).exists())) {
  console.log(`Using existing sidecar ${dest}`)
} else {
  await (sidecarConfig.ocBinary.includes("-baseline")
    ? $`cd ../opencode && bun run build --single --baseline --skip-embed-web-ui`
    : $`cd ../opencode && bun run build --single --skip-embed-web-ui`)
  await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
}
