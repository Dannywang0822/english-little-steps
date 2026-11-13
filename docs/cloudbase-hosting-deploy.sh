#!/usr/bin/env bash
# Deploy static hosting for english-little-steps (run after: PATH="$HOME/.local/bin:$PATH" tcb login)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_ID="english-little-steps-d0a2b84764b"
STAGE="$ROOT/_cloudbase_hosting"
rm -rf "$STAGE"
mkdir -p "$STAGE/js" "$STAGE/data" "$STAGE/css"
cp "$ROOT/index.html" "$ROOT/cloudbase-config.js" "$ROOT/.nojekyll" "$STAGE/"
# App JS (do not recurse into vendor here)
find "$ROOT/js" -maxdepth 1 -type f -name '*.js' -exec cp {} "$STAGE/js/" \;
[ -d "$ROOT/js/vendor" ] && cp -a "$ROOT/js/vendor" "$STAGE/js/"
[ -d "$ROOT/css" ] && cp -a "$ROOT/css/." "$STAGE/css/"
[ -d "$ROOT/data" ] && cp -a "$ROOT/data/." "$STAGE/data/"
for d in wordnet wordnet-test saturday-club-test; do
  [ -d "$ROOT/$d" ] && cp -a "$ROOT/$d" "$STAGE/"
done
export PATH="$HOME/.local/bin:$PATH"
tcb hosting deploy "$STAGE" -e "$ENV_ID"
echo "Deployed. Verify: https://english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com/"
