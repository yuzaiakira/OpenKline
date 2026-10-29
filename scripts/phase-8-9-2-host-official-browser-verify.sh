#!/usr/bin/env bash
# Phase 8.9.2 — host-terminal official Playwright verification.
# Run this in a normal Manjaro terminal (Konsole/Alacritty), NOT inside the
# Cursor agent-exec sandbox. The agent remounts /run as a 4k RO tmpfs that
# hides /run/docker.sock.
set -euo pipefail

REQUIRED_IMAGE='mcr.microsoft.com/playwright:v1.64.1-noble'
REQUIRED_DIGEST='sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea'
REQUIRED_REF="${REQUIRED_IMAGE}@${REQUIRED_DIGEST}"
PRODUCT_FIX='02e92874fa60e176099acb3eb96953858e31e87e'
DEFAULT_TIP='d7e9f568d80322a33ce2f4164e1c81299b8e1c16'
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

die() { echo "ERROR: $*" >&2; exit 1; }

echo "=== Phase 8.9.2 host official browser verify ==="
echo "Refuse to continue inside Cursor agent-exec if /run is overlaid."

if [[ "${CURSOR_EXTENSION_HOST_ROLE:-}" == "agent-exec" ]]; then
  die "CURSOR_EXTENSION_HOST_ROLE=agent-exec; run this script in a normal host terminal instead."
fi
if [[ ! -S /run/docker.sock && ! -S /var/run/docker.sock ]]; then
  die "/run/docker.sock is missing. Start Docker Engine (systemctl --user? or systemctl start docker) in a host session."
fi
if findmnt -n /run 2>/dev/null | grep -q 'size=4k'; then
  die "/run appears overlaid with a 4k tmpfs (Cursor agent sandbox). Use a host terminal."
fi

command -v docker >/dev/null || die "docker binary not found"
docker info >/dev/null || die "docker daemon not reachable (permission or inactive service)"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || die "not inside an OpenKline git working tree"
cd "$ROOT"
SOURCE_SHA="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$PRODUCT_FIX" HEAD || die "product fix $PRODUCT_FIX is not an ancestor of HEAD=$SOURCE_SHA"
echo "ROOT=$ROOT"
echo "SOURCE_SHA=$SOURCE_SHA"
echo "PRODUCT_FIX_ANCESTOR=$PRODUCT_FIX"

ART="$ROOT/artifacts/phase-8-9-2/official-$STAMP"
mkdir -p "$ART"/{host,container,lifecycle,matrices,node,performance}
echo "$SOURCE_SHA" | tee "$ART/tested-sha.txt"

echo "=== Docker image digest ==="
if ! docker image inspect "$REQUIRED_REF" >/dev/null 2>&1; then
  if docker image inspect "$REQUIRED_IMAGE" >/dev/null 2>&1; then
    PRESENT="$(docker image inspect "$REQUIRED_IMAGE" --format '{{index .RepoDigests 0}}' || true)"
    echo "Present local image digest: $PRESENT"
  fi
  echo "Pulling exact digest-pinned image (only if missing)..."
  docker pull "$REQUIRED_REF"
fi
DIGEST_LINE="$(docker image inspect "$REQUIRED_REF" --format '{{index .RepoDigests 0}}')"
echo "$DIGEST_LINE" | tee "$ART/host/image-digest.txt"
echo "$DIGEST_LINE" | grep -q "$REQUIRED_DIGEST" || die "image digest mismatch: $DIGEST_LINE"

GIT_COMMON="$(git rev-parse --git-common-dir)"
GIT_COMMON="$(cd "$GIT_COMMON" && pwd)"
MAIN_GITDIR="/home/akira/Projects/git-contribute/OpenKline/.git"
DOCKER_MOUNTS=(-v "$ROOT:/work")
# Dual-mount for detached worktrees whose common gitdir lives outside /work.
if [[ "$GIT_COMMON" != "$ROOT/.git" && "$GIT_COMMON" != "$MAIN_GITDIR" ]]; then
  DOCKER_MOUNTS+=(-v "$GIT_COMMON:$GIT_COMMON")
elif [[ -f "$ROOT/.git" ]]; then
  # File gitdir pointer worktree: also mount the real common dir.
  DOCKER_MOUNTS+=(-v "$GIT_COMMON:$GIT_COMMON")
fi
# Always mount the primary repo gitdir when verifying from a linked worktree.
if [[ -f "$ROOT/.git" && -d "$MAIN_GITDIR" ]]; then
  DOCKER_MOUNTS+=(-v "$MAIN_GITDIR:$MAIN_GITDIR")
fi

run_in_container() {
  local name="$1"; shift
  docker run --rm --init --ipc=host \
    "${DOCKER_MOUNTS[@]}" \
    -w /work \
    -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    -e HOME=/tmp/openkline-home \
    -e npm_config_cache=/tmp/openkline-npm-cache \
    -e CI=1 \
    --name "openkline-892-$name-$$" \
    "$REQUIRED_REF" \
    bash -lc "$*"
}

echo "=== Container setup: npm ci + build + browser versions ==="
run_in_container setup "$(cat <<EOS
set -euo pipefail
mkdir -p "\$HOME" "\$npm_config_cache"
git config --global --add safe.directory /work
git config --global --add safe.directory /home/akira/Projects/git-contribute/OpenKline || true
echo "HEAD=\$(git rev-parse HEAD)"
node -v; npm -v; npx playwright --version
npm ci --ignore-scripts --no-audit --no-fund
(cd examples/nextjs-app-router && npm ci --ignore-scripts --no-audit --no-fund)
npm run build
OUT=artifacts/phase-8-9-2/official-$STAMP/host
mkdir -p "\$OUT"
node -e 'const {chromium,firefox,webkit}=require("playwright");(async()=>{
  for (const [n,b] of [["chromium",chromium],["firefox",firefox],["webkit",webkit]]) {
    const browser=await b.launch(); console.log(n, browser.version(), b.executablePath()); await browser.close();
  }
})()' | tee "\$OUT/managed-browser-versions.txt"
ls /ms-playwright | head
EOS
)" | tee "$ART/host/setup.log"

echo "=== Targeted lifecycle on all five portable projects ==="
set +e
run_in_container lifecycle "$(cat <<EOS
set -euo pipefail
mkdir -p "\$HOME" "\$npm_config_cache"
git config --global --add safe.directory /work
OUT=artifacts/phase-8-9-2/official-$STAMP/lifecycle
mkdir -p "\$OUT"
set +e
npx playwright test --config playwright.portable.config.ts \
  tests/browser/datafeed-lifecycle.spec.ts \
  --reporter=line \
  --output="\$OUT/test-results" \
  2>&1 | tee "\$OUT/playwright-stdout.log"
RC=\${PIPESTATUS[0]}
set -e
echo "\$RC" | tee "\$OUT/exit-code.txt"
exit "\$RC"
EOS
)"
LIFECYCLE_RC=$?
set -e
echo "$LIFECYCLE_RC" | tee "$ART/lifecycle/host-wrapper-exit.txt"
[[ "$LIFECYCLE_RC" -eq 0 ]] || die "targeted lifecycle failed (rc=$LIFECYCLE_RC); not running full matrices"

echo "=== Positive controls (portable) ==="
set +e
run_in_container positives "$(cat <<EOS
set -euo pipefail
mkdir -p "\$HOME" "\$npm_config_cache"
git config --global --add safe.directory /work
OUT=artifacts/phase-8-9-2/official-$STAMP/lifecycle/positives
mkdir -p "\$OUT"
set +e
npx playwright test --config playwright.portable.config.ts \
  tests/browser/chart.spec.ts \
  tests/browser/custom-datafeed.spec.ts \
  tests/browser/replay.spec.ts \
  tests/browser/klinescript.spec.ts \
  --reporter=line \
  --output="\$OUT/test-results" \
  2>&1 | tee "\$OUT/playwright-stdout.log"
RC=\${PIPESTATUS[0]}
set -e
echo "\$RC" | tee "\$OUT/exit-code.txt"
exit "\$RC"
EOS
)"
POS_RC=$?
set -e
echo "$POS_RC" | tee "$ART/lifecycle/positives-exit.txt"
[[ "$POS_RC" -eq 0 ]] || die "positive controls failed; not running full matrices"

cleanup_ports() {
  fuser -k 4173/tcp 2>/dev/null || true
  fuser -k 4174/tcp 2>/dev/null || true
  pkill -f 'next dev' 2>/dev/null || true
  pkill -f 'next-server' 2>/dev/null || true
  rm -f "$ROOT/examples/nextjs-app-router/.next/dev/lock" 2>/dev/null || true
}

STANDALONE_OUT="artifacts/browser-verification/phase-8-9-2-standalone-$STAMP"
STUDIO_OUT="artifacts/studio-browser-verification/phase-8-9-2-studio-$STAMP"

echo "=== Full standalone matrix: npm run browser:verify ==="
cleanup_ports
set +e
run_in_container standalone "$(cat <<EOS
set -euo pipefail
mkdir -p "\$HOME" "\$npm_config_cache"
git config --global --add safe.directory /work
fuser -k 4173/tcp 2>/dev/null || true
npm run browser:verify -- --output=$STANDALONE_OUT
EOS
)" | tee "$ART/matrices/standalone-wrapper.log"
STANDALONE_RC=$?
set -e
echo "$STANDALONE_RC" | tee "$ART/matrices/standalone-exit.txt"

echo "=== Full Studio matrix: npm run studio:browser:verify ==="
cleanup_ports
set +e
run_in_container studio "$(cat <<EOS
set -euo pipefail
mkdir -p "\$HOME" "\$npm_config_cache"
git config --global --add safe.directory /work
fuser -k 4174/tcp 2>/dev/null || true
rm -f examples/nextjs-app-router/.next/dev/lock 2>/dev/null || true
npm run studio:browser:verify -- --output=$STUDIO_OUT
EOS
)" | tee "$ART/matrices/studio-wrapper.log"
STUDIO_RC=$?
set -e
echo "$STUDIO_RC" | tee "$ART/matrices/studio-exit.txt"

echo "=== Node / package / packed consumer / benchmark ==="
set +e
run_in_container nodepack "$(cat <<EOS
set -euo pipefail
mkdir -p "\$HOME" "\$npm_config_cache"
git config --global --add safe.directory /work
OUT=artifacts/phase-8-9-2/official-$STAMP
mkdir -p "\$OUT/node" "\$OUT/performance"
run_step() {
  local name="\$1"; shift
  set +e
  "\$@" 2>&1 | tee "\$OUT/node/\${name}.log"
  local rc=\${PIPESTATUS[0]}
  set -e
  echo "\$rc" | tee "\$OUT/node/\${name}-exit.txt"
  return "\$rc"
}
FAIL=0
run_step npm-test npm test || FAIL=1
run_step typecheck npm run typecheck || FAIL=1
run_step api-check npm run api:check || FAIL=1
run_step package-smoke npm run package:smoke || FAIL=1
set +e
node scripts/phase-8-9-1-packed-datafeed-lifecycle.mjs 2>&1 | tee "\$OUT/node/packed-lifecycle.log"
RC=\${PIPESTATUS[0]}
set -e
echo "\$RC" | tee "\$OUT/node/packed-lifecycle-exit.txt"
[[ "\$RC" -eq 0 ]] || FAIL=1
set +e
npm run benchmark:browser 2>&1 | tee "\$OUT/performance/browser-benchmark.log"
RC=\${PIPESTATUS[0]}
set -e
echo "\$RC" | tee "\$OUT/performance/benchmark-exit.txt"
[[ "\$RC" -eq 0 ]] || FAIL=1
exit "\$FAIL"
EOS
)"
NODE_RC=$?
set -e
echo "$NODE_RC" | tee "$ART/node/wrapper-exit.txt"

python3 - <<PY
import json, os
art = "$ART"
standalone = os.path.join("$ROOT", "$STANDALONE_OUT", "summary.json")
studio = os.path.join("$ROOT", "$STUDIO_OUT", "summary.json")
def load(p):
  return json.load(open(p)) if os.path.exists(p) else {"missing": True, "path": p}
def exit_or(path, default=None):
  return int(open(path).read()) if os.path.exists(path) else default
summary = {
  "testedSha": open(os.path.join(art, "tested-sha.txt")).read().strip(),
  "productFix": "$PRODUCT_FIX",
  "imageDigest": open(os.path.join(art, "host", "image-digest.txt")).read().strip(),
  "lifecycleHostExit": exit_or(os.path.join(art, "lifecycle", "host-wrapper-exit.txt")),
  "positivesExit": exit_or(os.path.join(art, "lifecycle", "positives-exit.txt")),
  "standaloneExit": exit_or(os.path.join(art, "matrices", "standalone-exit.txt")),
  "studioExit": exit_or(os.path.join(art, "matrices", "studio-exit.txt")),
  "nodeWrapperExit": exit_or(os.path.join(art, "node", "wrapper-exit.txt")),
  "packedLifecycleExit": exit_or(os.path.join(art, "node", "packed-lifecycle-exit.txt")),
  "benchmarkExit": exit_or(os.path.join(art, "performance", "benchmark-exit.txt")),
  "standaloneSummary": load(standalone),
  "studioSummary": load(studio),
}
path = os.path.join(art, "decision.json")
json.dump(summary, open(path, "w"), indent=2)
print(json.dumps({k: summary[k] for k in summary if k not in ("standaloneSummary", "studioSummary")}, indent=2))
ss = summary["standaloneSummary"]; st = summary["studioSummary"]
print("standalone.status", ss.get("status"), "stats", (ss.get("testResult") or {}).get("stats") or ss.get("stats"))
print("studio.status", st.get("status"), "stats", (st.get("testResult") or {}).get("stats") or st.get("stats"))
PY

echo
echo "DONE artifacts=$ART"
echo "standalone_rc=$STANDALONE_RC studio_rc=$STUDIO_RC lifecycle_rc=$LIFECYCLE_RC node_rc=$NODE_RC"
BROWSER_OK=0
if [[ "$LIFECYCLE_RC" -eq 0 && "$POS_RC" -eq 0 && "$STANDALONE_RC" -eq 0 && "$STUDIO_RC" -eq 0 ]]; then
  BROWSER_OK=1
  echo "HOST_BROWSER_VERDICT=FUNCTIONALLY_VERIFIED_FULL_FIVE_BROWSER_PASS"
else
  echo "HOST_BROWSER_VERDICT=INVESTIGATE_FAILURES"
fi
if [[ "$BROWSER_OK" -eq 1 && "$NODE_RC" -eq 0 ]]; then
  echo "HOST_VERDICT_CANDIDATE=FUNCTIONALLY_VERIFIED_FULL_FIVE_BROWSER_PASS"
  exit 0
fi
if [[ "$BROWSER_OK" -eq 1 ]]; then
  echo "HOST_VERDICT_CANDIDATE=FIVE_BROWSER_PASS_NODE_OR_PACKED_INCOMPLETE"
  exit 1
fi
echo "HOST_VERDICT_CANDIDATE=INVESTIGATE_FAILURES"
exit 1
