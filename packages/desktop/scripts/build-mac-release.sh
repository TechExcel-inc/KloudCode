#!/usr/bin/env bash
# Build unsigned macOS release (x86_64) and copy artifacts to dist-mac/
set -euo pipefail

root="$(cd "$(dirname "$0")/../../.." && pwd)"
desktop="$root/packages/desktop"
out="$root/dist-mac"
cfg="$desktop/src-tauri/tauri.unsigned.conf.json"
ver="${OPENCODE_VERSION:-1.4.3}"
target="x86_64-apple-darwin"

cd "$root"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: macOS only" >&2
  exit 1
fi

if ! command -v bun >/dev/null; then
  echo "error: bun not found" >&2
  exit 1
fi

# Offline models.dev snapshot (avoids network during CLI build)
snapshot="$root/packages/opencode/src/provider/models-snapshot.js"
if [[ ! -f "$snapshot" ]]; then
  echo "error: missing $snapshot — run: cd packages/opencode && bun run build" >&2
  exit 1
fi
python3 - <<PY
from pathlib import Path
s = Path("$snapshot").read_text()
key = "export const snapshot = "
i = s.index(key) + len(key)
Path("/tmp/models-api.json").write_text(s[i:].strip())
print("models snapshot ready")
PY

if [[ ! -f "$cfg" ]]; then
  cat > "$cfg" <<'EOF'
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "KloudCode",
  "identifier": "ai.kloudcode.desktop",
  "bundle": {
    "createUpdaterArtifacts": false,
    "icon": [
      "icons/prod/32x32.png",
      "icons/prod/128x128.png",
      "icons/prod/128x128@2x.png",
      "icons/prod/icon.icns",
      "icons/prod/icon.ico"
    ],
    "macOS": {
      "signingIdentity": null
    }
  }
}
EOF
  echo "wrote $cfg"
fi

export OPENCODE_CHANNEL="${OPENCODE_CHANNEL:-latest}"
export OPENCODE_VERSION="$ver"
export RUST_TARGET="$target"
export TAURI_ENV_TARGET_TRIPLE="$target"
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"
export CSC_IDENTITY_AUTO_DISCOVERY=false
export MODELS_DEV_API_JSON=/tmp/models-api.json
export OPENCODE_REBUILD_SIDECAR=1

echo "==> predev (sidecar rebuild) version=$ver target=$target"
cd "$desktop"
bun ./scripts/predev.ts

sidecar="$desktop/src-tauri/sidecars/opencode-cli-$target"
if [[ ! -f "$sidecar" ]]; then
  echo "error: sidecar not found at $sidecar" >&2
  exit 1
fi
if ! rg -q 'kloudcode' "$sidecar"; then
  echo "error: sidecar missing kloudcode brand (stale opencode binary?)" >&2
  exit 1
fi
echo "==> sidecar ok ($(wc -c < "$sidecar" | tr -d ' ') bytes, kloudcode brand verified)"

echo "==> tauri build (unsigned release)"
bun run tauri build --target "$target" --config ./src-tauri/tauri.unsigned.conf.json

bundle="$desktop/src-tauri/target/$target/release/bundle"
app="$(find "$bundle/macos" -maxdepth 1 -name 'KloudCode.app' -type d | head -1)"
if [[ -z "$app" ]]; then
  app="$(find "$bundle/macos" -maxdepth 1 -name '*.app' -type d -newer "$bundle/dmg" 2>/dev/null | head -1)"
fi
if [[ -z "$app" ]]; then
  app="$(ls -td "$bundle/macos"/*.app 2>/dev/null | head -1)"
fi
dmg="$(find "$bundle/dmg" -maxdepth 1 -name '*.dmg' -type f | head -1)"

if [[ -z "$app" || -z "$dmg" ]]; then
  echo "error: missing bundle artifacts under $bundle" >&2
  ls -laR "$bundle" >&2 || true
  exit 1
fi

mkdir -p "$out"
rm -rf "$out/$(basename "$app")"
cp -R "$app" "$out/"
cp "$dmg" "$out/"

echo "==> done"
ls -lah "$out/$(basename "$app")" "$out/$(basename "$dmg")"
echo "output: $out"
