#!/usr/bin/env bash
# Deploy static hosting for english-little-steps (run after: PATH="$HOME/.local/bin:$PATH" tcb login)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_ID="english-little-steps-d0a2b84764b"
STAGE="$ROOT/_cloudbase_hosting"
rm -rf "$STAGE"
mkdir -p "$STAGE/js" "$STAGE/data"
cp "$ROOT/index.html" "$ROOT/cloudbase-config.js" "$ROOT/.nojekyll" "$STAGE/"
cp "$ROOT/js/cloud-sync.js" "$STAGE/js/"
[ -d "$ROOT/js/vendor" ] && cp -a "$ROOT/js/vendor" "$STAGE/js/"
[ -f "$ROOT/data/topics.json" ] && cp "$ROOT/data/topics.json" "$STAGE/data/"
export PATH="$HOME/.local/bin:$PATH"
tcb hosting deploy "$STAGE" -e "$ENV_ID"
echo "Deployed. Verify: https://english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com/"
