#!/usr/bin/env bash
# Builds dist/SkyGreeting-LIVE.zip: a folder Daniel unzips on a Windows PC and starts by
# double-clicking "Start SkyGreeting LIVE.bat". It carries its own Node (node.exe from
# nodejs.org, checked against the release's SHASUMS256), the site files the stream page
# needs, and live/ with its node_modules, so nothing has to be installed.
#   tools/package-live.sh            (run from the repo root, needs curl, zip, npm)
set -euo pipefail
NODE_VERSION="${NODE_VERSION:-v22.23.3}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/SkyGreeting-LIVE"
rm -rf "$ROOT/dist" && mkdir -p "$OUT/node" "$OUT/live/sources"

cp -r "$ROOT/index.html" "$ROOT/src" "$ROOT/vendor" "$ROOT/favicon.ico" "$ROOT/favicon.svg" "$ROOT/site.webmanifest" "$ROOT/icons" "$OUT/"
cp "$ROOT"/live/{server.mjs,rules.mjs,settings.mjs,admin.html,package.json,package-lock.json,README.md} "$OUT/live/"
cp "$ROOT"/live/sources/*.mjs "$OUT/live/sources/"
(cd "$OUT/live" && npm ci --omit=dev --no-audit --no-fund --silent)

curl -fsSL -o "$OUT/node/node.exe" "https://nodejs.org/dist/$NODE_VERSION/win-x64/node.exe"
expected="$(curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" | awk '$2 == "win-x64/node.exe" { print $1 }')"
actual="$(sha256sum "$OUT/node/node.exe" | awk '{ print $1 }')"
[ "$expected" = "$actual" ] || { echo "node.exe checksum mismatch" >&2; exit 1; }

cp "$ROOT/live/windows/Start SkyGreeting LIVE.bat" "$ROOT/live/windows/READ ME FIRST.txt" "$OUT/"
# Windows wants CRLF in .bat and .txt files.
sed -i 's/\r*$/\r/' "$OUT/Start SkyGreeting LIVE.bat" "$OUT/READ ME FIRST.txt"
(cd "$ROOT/dist" && zip -qr -9 SkyGreeting-LIVE.zip SkyGreeting-LIVE)
ls -lh "$ROOT/dist/SkyGreeting-LIVE.zip"
