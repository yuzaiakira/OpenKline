# OpenKline Phase 15.5 — Replay Hardening and Recovery Verification

Date: 2026-10-31
Branch: `main`
Starting SHA: `0a4094a242b04bdd71b535a758101b2c64b19f13`
Verification baseline: `0a4094a242b04bdd71b535a758101b2c64b19f13`

## Result

Phase 15.5 implementation was resumed from the last pushed commit and was not
recreated. The source-scoped identity, bounded checkpoint, derived-state
isolation, indexed-seek, bounded-snapshot, benchmark, and Studio changes remain
locally and remotely present. Fresh local verification completed for the
available Node, system-Chromium, React/Studio, package, stress, and benchmark
gates.

The engineering milestone remains open for the protected historical API
baseline, Playwright-managed Firefox/WebKit/mobile-Safari execution, physical
devices, formal accessibility/visual approval, the offline consumer-preview
environment issue, licensing, and release authorization. Phase 16 was not
started.

No GitHub Actions, npm publication, release tag, public release, license
adoption, force-push, history rewrite, or external market-data credential was
used.

## Git evidence

The four Phase 15.5 implementation commits were already present on
`origin/main` and were not recreated:

- `4d2ef55777879de7411704dd7e9bf3c3b7377af4` — source-scoped replay identities
- `8a0ac4548a050be96ae950facf06506841551de3` — bounded checkpoints and panel snapshots
- `d0ee7d1988922dac9064984c0ecb20ca2374c3a1` — source-isolated derived state
- `0a4094a242b04bdd71b535a758101b2c64b19f13` — multi-instrument Studio coverage

The final documentation/audit commit is the commit that adds this report and
the corresponding roadmap and audit updates; its exact SHA is verified in the
post-push handoff. The required identity for all commits is:

`Akira Yuzai <yuzai.akira@gmail.com>`

The final handoff verifies `HEAD == origin/main` and a clean working tree.

## Implemented Phase 15.5 capabilities

### Identity and causality

- Canonical trade logical identity is the collision-safe tuple
  `(instrumentId, venueId, sourceId, sourceVersion, tradeId)`.
- Replay event IDs, source trade IDs, logical identities, and revisions remain
  distinct concepts. `sourceVersion` is the provider/dataset generation, not a
  trade revision; trade revisions remain monotonic within one logical stream.
- JSON tuple encoding avoids delimiter collisions and is used by the trade
  store, replay tape revisions, runtime maps, CVD/Footprint corrections,
  checkpoints, filtering, and fingerprints.
- Candle identity includes instrument, venue, source generation, timeframe,
  and timestamp. Corporate-action identity is source-scoped and includes the
  instrument; independent streams are never merged.
- The pre-fix regression was reproduced during the implementation milestone:
  identical provider trade IDs from independent streams were treated as one
  revision and produced a duplicate-revision failure. The focused regression
  and fresh 322-test run now verify the corrected behavior.

### Checkpoints and seeks

- Default checkpoint policy is interval `250`, maximum `64` retained
  checkpoints, and an approximate retained-state budget of `64 MiB`.
- Retention uses deterministic oldest-event eviction and preflight estimation;
  the budget is an estimator for retained cloned state, not a hard JavaScript
  heap limit. Diagnostics expose retention, estimate, oldest/newest index, and
  eviction count.
- Checkpoint identity includes tape version/fingerprint, clock and knowledge
  policy, ordering version, and replay state. Restoration rejects mismatched
  policy/data identity and falls back to deterministic reconstruction.
- Monotonic timestamp streams use binary upper-bound lookup. Clock-regression
  uncertainty keeps conservative behavior. Event-ID lookup uses a direct index.
- Existing order-book sequence/gap/recovery semantics remain intact; no
  separate unsafe checkpoint shortcut was introduced.

### Snapshots, panels, and packaging

- Public snapshots can select one instrument and bound materialized trades;
  completeness metadata distinguishes complete, bounded, and truncated reads.
- Replay coordinator panels request instrument-scoped snapshots instead of
  repeatedly materializing the complete multi-instrument state. Reads are
  defensive and panel-isolated.
- Canonical replay serialization/import/export and fingerprints preserve the
  source identity contract. The offline Studio Market Replay Lab includes a
  deterministic BTC/ETH collision fixture using identical provider trade IDs
  and a working instrument selector.
- Public additions are additive: `marketTradeLogicalIdentity`, checkpoint
  diagnostics, snapshot options, and trade-materialization metadata are
  inventoried without rewriting the protected API baseline.

## Fresh validation evidence

Environment: Node `v24.19.0`, npm `11.9.0`, Linux x64, Playwright `1.64.1`,
system Chromium `154.0.8037.57` from `/usr/bin/chromium`. The configured
Chromium projects explicitly use the system executable; it is not a
Playwright-managed browser.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 322/322, 0 failed, 0 skipped |
| `npm run test:market-replay` | PASS — 17/17 |
| `npm run test:browser` | PASS — 35/35 Chromium |
| `npm run test:react:browser` | PASS — 38/38 React/Studio Chromium |
| `npm run test:react:production` | PASS — Next production build and 1/1 Chromium |
| `npm --prefix examples/nextjs-app-router run build` | PASS |
| `npm run stress:ci` | PASS — Node and browser profiles; 0 orphan failures, 0 worker orphans, 0 remaining canvases |
| `npm run api:inventory` | PASS — 319 runtime exports, 736 type exports; baseline not written |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED — no removals or findings |
| `npm run api:check` | FAIL/OPEN — no removals; three inherited declaration hash changes remain unapproved |
| `npm run studio:check` | PASS — core remains framework-independent |
| `npm run package:check` | PASS — local tarball, 518 files |
| `npm run package:smoke` | PASS — ESM consumer installed from local tarball |
| `npm run package:audit` | PASS — license remains pending owner approval |
| `npm run package:portability` | PASS — zero core/React runtime dependencies |
| `npm run distribution:check` | PASS — 518 files, SHA-1 `bc1ee64e25a4700cae9af465499579ab908558e2` |
| `npm run release:check` | BLOCKED/FAILED — offline consumer preview hit npm `ERESOLVE` while resolving React peer metadata; no source assertion failed |

The release-check command internally reached passing unit, browser-provenance,
benchmark, license-inventory, dependency-audit, and package-audit stages before
the independent offline consumer-preview step failed. That command is not
reported as a complete pass.

## Browser matrix

The compatibility command discovered 140 test records:

| Project | Result | Reason |
|---|---:|---|
| Chromium | 35/35 PASS | System Chromium 154.0.8037.57 |
| mobile-Chrome emulation | 35/35 PASS | Pixel 7 emulation on system Chromium |
| Firefox | 35 BLOCKED before assertions | Missing `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` |
| WebKit | 35 BLOCKED before assertions | Missing `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` |
| mobile-Safari emulation | 35 BLOCKED before assertions | Same missing WebKit executable |

The command exited non-zero because the three unavailable projects could not
launch. The 105 records are environment failures, not product assertion
failures. No system Firefox/Safari substitution, arbitrary binary, TLS bypass,
or repeated artifact-download retry was used. Physical devices were not
tested.

React Studio assertions additionally passed 38/38 in Chromium, including
workspace restoration, multi-panel replay, touch-sized layout, drawing
anchors, cleanup, accessibility semantics, and preliminary contrast checks.
Formal cross-browser accessibility and visual approval remains open.

## Performance and memory evidence

These are reproducible observations from this cloud environment, not universal
capacity claims. The replay benchmark uses independent samples and reports
validation/construction separately from pure event-step work.

### Market replay benchmark

| Events | Tape build | Validation median/p95 | Construction median/p95 | Steady event median/p95 | Checkpoint-boundary median/p95 | Snapshot median/p95 | Panel snapshot median/p95 | Cold seek median | Warm seek median |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 42.522 ms | 27.101/31.730 ms | 27.001/32.090 ms | 0.007/0.019 ms | 1.338/1.736 ms | 0.446/1.561 ms | 0.241/0.507 ms | 4.462 ms | 1.263 ms |
| 10,000 | 255.612 ms | 218.577/234.839 ms | 231.267/243.694 ms | 0.009/0.011 ms | 0.887/0.929 ms | 1.323/1.661 ms | 1.279/1.590 ms | 73.203 ms | 43.326 ms |
| 100,000 | 2,515.660 ms | 2,375.654/2,381.273 ms | 2,324.902/2,423.196 ms | 0.006/0.012 ms | 1.413/1.696 ms | 11.195/14.626 ms | 7.758/16.022 ms | 920.620 ms | 132.247 ms |

Checkpoint diagnostics were respectively `3/0`, `5/83`, and `2/62`
retained/evictions for 1k/10k/100k. Estimated retained bytes were
2,131,624, 60,307,788, and 45,107,644. The 100k checkpoint profile observed
`393,497,144` bytes before checkpoint creation, `336,036,016` after, and
`120,697,344` after disposal in the Node heap measurement. These observations
do not establish a hard memory ceiling or prove whole-process reclamation.

The optional 500k replay workload was not executed and has no passing claim.

### Canvas and multi-chart baselines

- `benchmark:browser`: fresh 100k fit measurement was 63.18 FPS,
  16.7 ms median and 16.8 ms p95 frame interval, with 0 canvases remaining
  after destruction. Browser heap was 503,521,827 bytes before destruction and
  4,056,164 bytes after destruction in that run.
- `benchmark:order-flow:browser`: real Canvas2D 100k realistic combined
  navigation reached 60.06 FPS (16.6 ms median, 17.0 ms p95); realtime reached
  57.47 FPS (16.5 ms median, 18.3 ms p95). Combined fit content is renderer
  bound and is not presented as a universal target. Scenarios returned to zero
  canvases.
- `benchmark:multi-chart`: dual 10k visible-range median/p95 was
  16.5/22.7 ms; dual 100k visible-range was 34.8/41.1 ms, pan 36.1/73.8 ms,
  zoom 34.6/85.7 ms, rapid alternating 34.0/71.6 ms, and realtime during
  navigation 37.1/158.0 ms. Dual 100k crosshair was 3.6/4.5 ms. All reports
  observed zero owned canvases after disposal.
- `profile:multi-chart`: linked visible-range visual median/p95 was
  33.9/41.0 ms; continuous pan 34.5/45.1 ms; continuous zoom 35.1/41.5 ms;
  realtime navigation 36.7/48.2 ms. The largest measured contributors were
  visible-data construction and Canvas2D full rendering, not identity lookup.
- `benchmark:cvd-cache`: append update median/p95 `0.004/0.018 ms`,
  historical correction parity `true`, and full snapshot correction cost
  302.527 ms in the Node fixture.
- `benchmark:realtime-cvd`: 100 append chart updates had median/p95
  `0.1/0.2 ms`; event-to-visual-frame median/p95 was `46.2/65.5 ms`; the
  correction path reported parity `true` and cleanup returned `1` canvas to
  `0`.
- `benchmark:dense-ohlcv`: 1k/10k/100k candle, OHLC, hollow, Heikin-Ashi,
  volume, and histogram scenarios completed with `1` to `0` canvas cleanup.

## Acceptance matrix

| Acceptance item | Status | Evidence / limitation |
|---|---|---|
| Source-scoped trade identity and collision regression | PASS | Focused tests and fresh 322-test suite |
| Source generation, revision, candle timeframe, and corporate-action isolation | PASS | Replay tape/controller tests |
| CVD/Footprint correction and as-of parity | PASS | Numerical parity fixtures and replay tests |
| Checkpoint identity, eviction, and restoration parity | PASS | Fresh replay tests and 1k/10k/100k diagnostics |
| Indexed timestamp and event-ID seeks | PASS | Controller tests and benchmark measurements |
| Bounded instrument-scoped snapshots and panel isolation | PASS | Coordinator tests, Studio tests, benchmark panel reads |
| Canonical import/export/fingerprint | PASS | Tape round-trip and fingerprint tests |
| Node and replay regression suite | PASS | 322/322 and 17/17 |
| Chromium and mobile-Chrome emulation | PASS | 35/35 each |
| React/Studio Chromium and production Next.js | PASS | 38/38 and 1/1 |
| Stress and resource cleanup | PASS | `stress:ci`: 0 orphan/worker orphan, 0 canvases |
| Package/distribution checks | PASS | Tarball, portability, audit, distribution, ESM smoke |
| Public API historical baseline approval | OPEN | `api:check` has no removals but three inherited changes and additive review |
| Offline consumer preview | BLOCKED | npm offline peer-resolution `ERESOLVE` in `release:check` |
| Official Firefox | BLOCKED | Playwright-managed executable unavailable |
| Official WebKit | BLOCKED | Playwright-managed executable unavailable |
| Mobile Safari emulation | BLOCKED | Requires missing Playwright WebKit executable |
| Physical-device verification | NOT VERIFIED | No devices attached |
| Formal accessibility and visual approval | OPEN | Preliminary Chromium checks only |
| Licensing and release authorization | OPEN | Package license remains pending owner/legal approval |
| Optional 500k replay benchmark | NOT VERIFIED | Not executed due cloud memory guard |
| Phase 16 readiness | NOT READY | Phase 15.5 open gates remain; Phase 16 not started |

## Documentation and synchronization

The identity, replay, order-flow, checkpoint, API, benchmark, roadmap, public
API inventory, and distribution audit documentation are present. The effective
license, npm publication state, protected API baseline, and release state were
not changed.

The final post-push handoff records the exact documentation commit, verifies
the author/committer identity, checks `HEAD == origin/main`, and confirms a
clean working tree. Phase 15.5 remains open until the explicitly listed
external and approval gates are resolved.
