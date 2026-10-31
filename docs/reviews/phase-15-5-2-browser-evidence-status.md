# Phase 15.5.2 browser-evidence status and trusted-host handoff

Status for the current revision: **BLOCKED**

Current source SHA: `dc8dad5a10e36ee975e63d000d9e3cf10e3b7914`

This document records the actual cloud result and the procedure for obtaining
portable evidence on a trusted host. A historical passing pack is not silently
reused as evidence for this revision.

## Current cloud run

The existing managed-only workflow was run with Playwright `1.64.1` on Linux
x64 (`6.18.55`) at:

`artifacts/browser-verification/2026-10-31T08-44-19-940Z/`

| Project | Distribution | Status | Result |
| --- | --- | --- | --- |
| chromium | Playwright-managed | BLOCKED | Missing `/home/agent/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` |
| firefox | Playwright-managed | BLOCKED | Missing `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` |
| webkit | Playwright-managed | BLOCKED | Missing `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` |
| mobile-chrome | Playwright-managed, Pixel 7 emulation | BLOCKED | Chromium executable missing |
| mobile-safari | Playwright-managed, iPhone 13 emulation | BLOCKED | WebKit executable missing |

The runner recorded `blocked-missing-official-browser`, exit code `1`, zero
launched expected tests, and 175 launch failures. These are environment launch
failures, not product assertion failures. No system browser was substituted.

Current cloud artifact hashes:

| Artifact | SHA-256 |
| --- | --- |
| `environment.json` | `3a936ed573ee83a56828f0e60964119743a25e9c207dedf2ade81ad3390bc005` |
| `summary.json` | `dc2f8a5d3f60b271d32a8eed6579673975e3d17c602daf383ab70991920cc1dc` |
| `playwright-results.json` | `f9f4a9eab0357e93b737e22ceca5cd201fa06c03a79bee478ee2fb7d7abc0548` |
| `playwright-stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `test-results/.last-run.json` | `dd8c720e82385fa700d6632779dca230fab99ff6c0bdc47b9929f459ff2f0db8` |

## Local diagnostic lane

For diagnostic separation only, the exact same source revision passed the
system-Chromium lane:

`artifacts/browser-diagnostic/2026-10-31T08-47-46-982Z/`

It reported 70/70 expected records with zero unexpected, skipped, or flaky
results using `/usr/bin/chromium` version `154.0.8037.57` and Pixel 7
emulation. Its status is `verified-local-diagnostic`. This is **not** managed
browser evidence and does not verify Firefox, WebKit, Mobile Safari, physical
devices, or native Safari.

Diagnostic artifact hashes are recorded for reproducibility:

| Artifact | SHA-256 |
| --- | --- |
| `environment.json` | `de7c5e98dc1518c5835649dd750a7d1979251b31f01ae364599aa8a28cff536a` |
| `playwright-results.json` | `1362b7f5e1a5f150251e3db483d72d822ff5b005559b70771d121e7e8c223389` |
| `playwright-stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `test-results/.last-run.json` | `91d1c43004802cd49950d78eb11c8fa7d05da8ffffe219a8b13b2f561bc00903` |

## Trusted-host handoff

The required managed-browser evidence must be produced on a trusted machine
with the official Playwright image and its pinned digest:

- Playwright package/CLI: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Required digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Browser path: `/ms-playwright`
- Projects: Chromium, Firefox, WebKit, Mobile Chrome (Pixel 7), Mobile Safari
  (iPhone 13/WebKit emulation)

On the trusted host, verify the checkout and image before running:

```bash
git fetch origin main
git checkout dc8dad5a10e36ee975e63d000d9e3cf10e3b7914
docker image inspect \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  --format '{{index .RepoDigests 0}}'
```

Run inside the image (the repository is mounted at `/work`):

```bash
docker run --rm \
  -v "$PWD:/work" -w /work \
  -e HOME=/tmp/openkline-home \
  -e NPM_CONFIG_CACHE=/tmp/openkline-npm-cache \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build && npm run browser:verify'
```

The trusted run must preserve a new report directory containing all of:

```text
environment.json
summary.json
playwright-results.json
playwright-stderr.log
test-results/
```

The handoff must include `sha256sum` output for the complete report and must
state the source SHA, image digest, Playwright version, operating system,
browser versions, project totals, and whether any test was blocked or failed.
Do not transfer browser binaries, personal paths, credentials, or raw archives
to the repository. The owner may provide the approved transfer mechanism.

## Historical evidence boundary

`npm run evidence:browser:check` currently validates the committed historical
packs. The Phase 8.6.1 pack is source
`19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`, not the current SHA, and records
70/70 managed-browser results. It remains valid for that historical revision
only. The Phase 8.8.17 pack is likewise historical (`bb3f1cad...`). Neither
pack clears the current-revision gate.

The compact validator checks declared SHA-256 format, expected trust anchors,
source identity, project identity, totals, provenance, and record consistency.
It cannot recompute a digest for raw artifacts intentionally excluded from the
compact Git evidence pack; the trusted host must perform that archive/artifact
hash verification before handoff.

## Acceptance boundary

| Claim | Status |
| --- | --- |
| Current cloud managed-browser execution | **BLOCKED** |
| Current system Chromium diagnostic | **PASS** (non-portable diagnostic only) |
| Historical five-project evidence validation | **PASS** for its recorded source revisions only |
| Current five-project compatibility | **NOT VERIFIED** |
| Physical Android/iOS compatibility | **NOT VERIFIED** |
| Release authorization | **REQUIRES OWNER APPROVAL** |
