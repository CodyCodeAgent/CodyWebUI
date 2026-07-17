#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="${CODY_RUNTIME_DIR:-$PROJECT_DIR/.cody-runtime}"
LOCK_HASH_FILE="$RUNTIME_DIR/package-lock.sha256"
cd "$PROJECT_DIR"; mkdir -p "$RUNTIME_DIR"

command -v node >/dev/null || { echo "Node.js 18+ is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }
node -e "const major=Number(process.versions.node.split('.')[0]); if(major<18) { console.error('Node.js 18+ is required.'); process.exit(1) }"
current_hash="$(node -e "const fs=require('fs'),crypto=require('crypto'); process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'))")"
installed_hash="$(test -f "$LOCK_HASH_FILE" && tr -d '[:space:]' < "$LOCK_HASH_FILE" || true)"
if [[ ! -d node_modules || "$current_hash" != "$installed_hash" ]]; then echo "Installing locked dependencies..."; npm ci; printf '%s\n' "$current_hash" > "$LOCK_HASH_FILE"
else echo "Dependencies are already initialized for the current lockfile."; fi

echo "Building production bundles..."; npm run build
"$SCRIPT_DIR/cody-service.sh" stop
"$SCRIPT_DIR/cody-service.sh" start

probe_host="${CODY_HOST:-127.0.0.1}"
[[ "$probe_host" == "0.0.0.0" ]] && probe_host="127.0.0.1"
[[ "$probe_host" == "::" ]] && probe_host="::1"
if [[ "$probe_host" == *:* ]]; then version_url="http://[$probe_host]:${CODY_PORT:-3000}/codex-api/meta/version"
else version_url="http://$probe_host:${CODY_PORT:-3000}/codex-api/meta/version"; fi
expected_sha="$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'unknown')"
actual_sha="$(node -e 'const url=process.argv[1]; fetch(url,{cache:"no-store"}).then(async response=>{if(!response.ok) throw new Error(`HTTP ${response.status}`); const body=await response.json(); process.stdout.write(String(body?.result?.gitSha??""))}).catch(error=>{console.error(error.message);process.exit(1)})' "$version_url")"
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "Deployment verification failed: expected Git $expected_sha but the running service reports $actual_sha." >&2
  exit 1
fi
echo "Deployment verified: $(node -e 'fetch(process.argv[1],{cache:"no-store"}).then(r=>r.json()).then(body=>console.log(body.result.label))' "$version_url")"
