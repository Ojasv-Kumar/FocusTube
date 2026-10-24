#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
EXT_ID="${1:-}"
if [[ ! "$EXT_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Usage: ./start-bridge.sh YOUR_FOCUSTUBE_EXTENSION_ID" >&2
  echo "Find the ID at brave://extensions on the Mac running FocusTube." >&2
  exit 2
fi
if [[ ! -f certs/server.crt || ! -f certs/server.key ]]; then
  echo "Generate certificates first: ./generate-certs.sh FRIEND_MAC_PRIVATE_IPV4" >&2
  exit 3
fi
if [[ ! -f .bridge-token ]]; then
  umask 077
  openssl rand -hex 32 > .bridge-token
fi
chmod 600 .bridge-token
export FOCUSTUBE_OLLAMA_TOKEN="$(tr -d '\r\n' < .bridge-token)"
export FOCUSTUBE_EXTENSION_ID="$EXT_ID"
node bridge.mjs
