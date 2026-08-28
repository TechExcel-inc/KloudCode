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
python3 - <<PY
from pathlib import Path
s = Path("$root/packages/opencode/src/provider/models-snapshot.js").read_text()
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

echo "==> predev (sidecar) version=$ver target=$target"
cd "$desktop"
bun ./scripts/predev.ts

echo "==> tauri build (unsigned release)"
bun run tauri build --target "$target" --config ./src-tauri/tauri.unsigned.conf.json

bundle="$desktop/src-tauri/target/$target/release/bundle"
app="$(find "$bundle/macos" -maxdepth 1 -name '*.app' -type d | head -1)"
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
