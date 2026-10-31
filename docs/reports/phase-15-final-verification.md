# OpenKline Phase 15 — Final Verification

Date: 2026-10-31  
Branch: `main`  
Starting SHA: `a0a4accbcedbc4ed350786545dae740a93dc7966`  
Verification baseline before this report: `bd5d13ab21b590b1e097cbe13c7f508cbe953932`

## Result

Phase 15 implementation is complete for the locally executable engineering
scope. The milestone remains open for protected API approval, official
Firefox/WebKit/mobile-browser execution, physical-device validation, formal
accessibility/visual review, licensing, and release authorization. Phase 16
has not started.

No GitHub Actions, npm publication, release tag, public release, license
adoption, or external provider credential was used.

## Implemented capabilities

- Versioned, provider-neutral `MarketReplayTape` contracts for candles,
  trades, Level-2 snapshots/deltas, corporate actions, sessions, and source
  status, with validation, canonical serialization, ordering metadata, and
  deterministic fingerprints.
- Deterministic event-time and receive-time replay with explicit knowledge
  policy, causal candle-open/completion boundaries, trade revisions, unknown
  aggressor handling, CVD, Footprint, session state, corporate-action state,
  source coverage, and integrity diagnostics.
- Sequenced order-book reconstruction with duplicate protection, gap
  quarantine, replacement-snapshot recovery, and conservative as-of behavior.
- Bounded checkpoints and seek restoration with parity against full replay.
  Selected-clock regressions are reported as uncertain rather than silently
  presented as complete chronology.
- Multi-instrument coordination with isolated panel registration and no global
  singleton. Chart attachment is additive; live datafeed writes are blocked
  while unified replay is active and disposal releases replay resources.
- Configuration-only replay workspace persistence. Runtime event state,
  checkpoints, and derived analytics are not serialized as resumable workspace
  state.
- Offline Next.js Market Replay Lab with deterministic controls, event
  inspector, source/fingerprint/coverage display, candle/trade/order-book
  views, CVD/Footprint details, and bounded Time & Sales/depth panels.
- Studio browser harness now scopes primary chart interactions to the primary
  workspace, so the independent Lab chart cannot steal canvas or replay
  selectors. The Lab replay controls also have an explicit accessible region.

## Correctness and test evidence

| Command | Result |
|---|---|
| `npm test` | PASS — 317/317 Node and policy tests |
| `npm run test:market-replay` | PASS — 13/13 |
| `npm run typecheck` | PASS |
| `npm run test:browser` | PASS — 35/35 Chromium |
| `npm run test:react:browser` | PASS — 38/38 Chromium Studio |
| `npm run test:react:production` | PASS — 1/1 Next production test |
| `npm run stress:ci` | PASS — Node and browser profiles; 0 orphan failures, 0 worker orphans, 0 remaining canvases |
| `npm run studio:check` | PASS — core remains framework-independent |
| `npm run package:check` | PASS |
| `npm run package:smoke` | PASS — ESM consumer installed from local tarball |
| `npm run package:audit` | PASS — license remains pending owner approval |
| `npm run package:portability` | PASS — zero core/React runtime dependencies |
| `npm run distribution:check` | PASS — 514 files, SHA-1 `c2cd2711be298b4f484252416d5cfe59c8d9156c` |
| `npm run api:inventory` | PASS — 318 runtime exports, 733 type exports |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED — no removals or incompatible declaration changes found |
| `npm run api:check` | FAIL/OPEN — protected historical baseline has no removals, but additive changes remain unapproved |

The protected API checker identified only these baseline changes: `Chart`,
`WorkspaceDocument`, and `WorkspaceRestoreOptions`. This is an approval gate,
not a removal or detected financial-correctness regression. The protected
baseline was not rewritten.

## Performance and memory evidence

All measurements below are local cloud-environment observations on Node
`v24.19.0`, Linux x64, and system Chromium `154.0.8037.57`. They are not
universal capacity or device-performance claims.

### Market replay Node benchmark

| Events | Validation median | Construction median | Next event median | Cold seek median | Warm checkpoint seek median | Export/import median | Multi-panel sync median | Heap used |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 26.479 ms | 23.452 ms | 22.320 ms | 25.740 ms | 2.393 ms | 46.360 ms | 0.055 ms | 9.1 MB |
| 10,000 | 221.413 ms | 247.348 ms | 222.420 ms | 290.174 ms | 14.454 ms | 434.369 ms | 0.031 ms | 17.9 MB |
| 100,000 | 2,602.009 ms | 2,573.528 ms | 2,192.292 ms | 2,775.160 ms | 668.556 ms | 4,567.237 ms | 0.066 ms | 109.6 MB |

The optional 500,000-event run was not executed. The 100,000-event Node
workload already approaches the available cloud memory/time budget; no 500k
result is claimed.

### Canvas and multi-chart measurements

- `benchmark:browser`: 100k fit workload produced 61.36 FPS, 16.6 ms median
  frame interval, 21.1 ms p95 frame interval, and 0 remaining canvases after
  destruction. The same run observed 612,550,727 bytes before destroy and
  4,038,604 bytes after destroy; these are browser heap observations, not a
  leak proof.
- `benchmark:order-flow:browser`: realistic 100k combined order-flow workload
  reached about 60.15 FPS with 16.6 ms median frame interval; destruction
  returned the chart to zero canvases and zero active workers.
- `benchmark:multi-chart`: dual 10k visual navigation median was 16.6–16.7
  ms; dual 100k visible-range/pan/zoom medians were 33.1–35.7 ms, with
  crosshair median 3.6 ms and p95 4.9 ms. All scenarios reported zero owned
  canvases after disposal.
- `profile:multi-chart`: the largest measured components were visible-data
  construction and series/pane/canvas rendering. No measured evidence required
  a new replay Worker, so the implementation remains synchronous and parity
  tested.
- `stress:ci`: 4,000 deterministic Node events, 40 advanced-module rounds,
  browser interaction and datafeed lifecycle rounds all passed.

## Browser compatibility

The installed Playwright package is `1.64.1`. This cloud environment has
system Chromium at `/usr/bin/chromium` but does not have the Playwright-managed
Firefox or WebKit executables.

The one compatibility command was run without downloading or substituting
untrusted browsers:

- Chromium: verified by the dedicated 35/35 suite.
- Mobile Chrome emulation: 35/35 passed in the compatibility matrix using
  Chromium.
- Firefox: 35 tests blocked before execution because
  `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` is absent.
- WebKit: 35 tests blocked before execution because
  `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` is absent.
- Mobile Safari emulation: 35 tests blocked because the WebKit executable is
  absent.
- Physical mobile devices: not tested.

The 105 blocked cases are environment availability results, not product test
failures. No TLS bypass, arbitrary browser binary, Docker substitution, or
repeated CDN retry was used.

## Acceptance matrix

| Phase 15 gate | Status | Evidence / limitation |
|---|---|---|
| Versioned multi-stream event contract | PASS | Tape validation, canonical round trip, fingerprint tests |
| Deterministic event/receive-time timeline | PASS | Controller tests and causal boundary fixtures |
| No-lookahead candle, trade, action, session, and order-flow state | PASS | 13 replay tests including post-frontier mutation and clock regression |
| Level-2 gap detection and recovery | PASS | Order-book controller and replay tests |
| Checkpoint seek parity and bounded state | PASS | Full reconstruction parity tests and benchmark |
| Multi-instrument/panel coordination | PASS | Isolated coordinator tests, Studio integration, multi-chart benchmark |
| Public Chart integration and lifecycle cleanup | PASS | Core browser suite, cleanup stress, zero canvases |
| Canonical replay workspace persistence | PASS | Parser rejects runtime state and ambiguous references |
| Offline Studio research workflow | PASS | React Chromium 38/38, production 1/1 |
| Performance evidence | PASS/PARTIAL | 1k/10k/100k measured; optional 500k not tested |
| Public API compatibility approval | OPEN | `api:check` requires owner approval for additive baseline update |
| Firefox/WebKit/Mobile Safari | BLOCKED | Playwright-managed executables unavailable in cloud |
| Physical-device verification | NOT TESTED | No physical device access |
| Formal accessibility and visual approval | OPEN | Local preliminary checks pass; formal cross-browser review unavailable |
| Licensing and release authorization | OPEN | No license adoption or release authorization was performed |

Phase 15 is therefore not formally closed. The unresolved gates must be
approved or completed by the project owner; they were not silently reclassified
as passed.

## Documentation and package status

Updated Phase 15 architecture, checkpoint, multi-chart, API, Studio guide,
benchmark, worker decision, roadmap, public API inventory, and distribution
audit documentation are present. The package remains unpublished, with local
pack verification only. License metadata remains intentionally pending legal
and owner approval.

## Git and synchronization verification

Git identity for all commits:

`Akira Yuzai <yuzai.akira@gmail.com>`

Phase 15 implementation commits pushed to `origin/main`:

- `dcfabe6e9e920cf5a5c06185fadcd7f79ad0f3dd` — versioned event tape
- `1a3c8b71b74fa02796c833f8ebbf63c59505f7b1` — deterministic timeline
- `55fd701ad468fbdb33661fde6d9da6db9e2ec6b1` — Chart/coordinator integration
- `5ee7b197498e2f74456a704392184d0028d30c46` — Studio research Lab
- `755dc5235ffc9b712ec8d4d111c3cd87b7ee9792` — causality verification
- `bd5d13ab21b590b1e097cbe13c7f508cbe953932` — Studio harness isolation

The final report/audit commit will be recorded below after it is created and
pushed. No history was rewritten and no force-push was used.

## Phase 16 readiness

Phase 16 is **not authorized to start**. Phase 15 remains open until the
protected API decision and the blocked browser/device/accessibility/visual,
licensing, and release gates are resolved by the appropriate owner or review
process.
