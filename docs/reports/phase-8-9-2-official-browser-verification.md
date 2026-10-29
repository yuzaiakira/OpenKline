# OpenKline Phase 8.9.2 — Official Playwright Environment Recovery

## Final technical verdict

**`FUNCTIONALLY VERIFIED — FULL FIVE-BROWSER PASS`**

Host digest-locked run
`artifacts/phase-8-9-2/official-20261029T170300Z` certified the P0
`Chart.setDatafeed()` lifecycle fix (`02e9287`) on all five portable projects,
full standalone and studio matrices, Node/API/package gates, packed tarball
consumer lifecycle, and browser benchmark — all exit **0** under the pinned
Playwright image.

## 1. Exact tested source

| Role | SHA |
| --- | --- |
| Historical browser-certified baseline | `bb3f1cad028b126920fa26a75f7ec158ebc56e3c` |
| P0 behavioral fix | `02e92874fa60e176099acb3eb96953858e31e87e` |
| Official host run tip | `a73334616543243245f0e63f2f845d1c31dd9e0c` |
| Branch | `qa/phase-8-9-2-official-browser-verification` |

Ancestry: `02e9287` ∈ ancestry of `a733346` (**YES**).

Primary artifacts stamp: `20261029T170300Z`

## 2. Official container digest and managed browsers

| Item | Value |
| --- | --- |
| Image | `mcr.microsoft.com/playwright:v1.64.1-noble` |
| Digest | `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` |
| Browsers path | `/ms-playwright` |
| Chromium | `156.0.8078.4` → `chromium-1248` |
| Firefox | `157.0` → `firefox-1555` |
| WebKit | `27.2` → `webkit-2370` |

## 3. Agent Docker blocker (context only)

Cursor agent-exec overlays `/run` with a 4k RO tmpfs that hides
`/run/docker.sock`. Official execution used
`scripts/phase-8-9-2-host-official-browser-verify.sh` in a normal Manjaro host
terminal. That environment limitation does not affect the certified host
results below.

## 4. Five-project targeted lifecycle

| Gate | Result |
| --- | --- |
| `tests/browser/datafeed-lifecycle.spec.ts` (portable five projects) | **20 passed**, exit **0** |
| Positive controls (`chart`, `custom-datafeed`, `replay`, `klinescript`) | **45 passed**, exit **0** |

## 5. Standalone full matrix

| Field | Value |
| --- | --- |
| Status | `verified` |
| Expected / unexpected / flaky / skipped | **95 / 0 / 0 / 0** |
| Wrapper exit | **0** |
| Output | `artifacts/browser-verification/phase-8-9-2-standalone-20261029T170300Z/` |

## 6. Studio full matrix

| Field | Value |
| --- | --- |
| Status | `PASS` |
| Expected / unexpected / flaky / skipped | **125 / 0 / 0 / 0** |
| Wrapper exit | **0** |
| Output | `artifacts/studio-browser-verification/phase-8-9-2-studio-20261029T170300Z/` |

## 7. Node / package / packed results (same official container)

| Gate | Exit |
| --- | --- |
| `npm test` (184 pass / 0 fail) | **0** |
| `npm run typecheck` | **0** |
| `npm run api:check` | **0** |
| `npm run package:smoke` | **0** |
| Packed datafeed lifecycle | **0** |
| `npm run benchmark:browser` | **0** |
| Node container wrapper | **0** |

Packed consumer confirmed: indicators cleared on `setDatafeed`, no orphaned
`pack-*` series, closes switched, indicator id re-add works.

Host verdict lines:

```text
HOST_BROWSER_VERDICT=FUNCTIONALLY_VERIFIED_FULL_FIVE_BROWSER_PASS
HOST_VERDICT_CANDIDATE=FUNCTIONALLY_VERIFIED_FULL_FIVE_BROWSER_PASS
```

Decision JSON:
`artifacts/phase-8-9-2/official-20261029T170300Z/decision.json`

## 8. Performance (official container Chromium)

From `artifacts/phase-8-9-2/official-20261029T170300Z/performance/browser-benchmark.log`
(`remainingCanvasCount: 0`):

| Candles | loadMs | updateFrameMs | rafFps | correctionMs |
| --- | ---: | ---: | ---: | ---: |
| 1_000 | 13.5 | 0.952 | 64.63 | 27.3 |
| 10_000 | 68.9 | 0.610 | 63.13 | 260.9 |
| 100_000 | 841.2 | 0.595 | 62.71 | 3597.1 |

At 100k: ~62.7 FPS, ~0.60 ms append frame, canvases after destroy **0**.
Comparable to prior Phase 8.9.1 local observation (~61.9 FPS / ~0.65 ms /
0 canvases); no functional regression signal in this gate.

## 9. Remaining functional defects

None identified for the P0 `setDatafeed` lifecycle fix under the official
five-browser environment.

Harness notes (non-product): host runner + packed/benchmark scripts now resolve
Playwright-managed Chromium when `PLAYWRIGHT_BROWSERS_PATH` is set so official
container runs do not depend on `/usr/bin/chromium`.

## 10. Evidence location

- Decision: `artifacts/phase-8-9-2/official-20261029T170300Z/decision.json`
- Host runner: `scripts/phase-8-9-2-host-official-browser-verify.sh`
- Packed harness: `scripts/phase-8-9-1-packed-datafeed-lifecycle.mjs`
- Benchmark harness: `scripts/browser-benchmark.mjs`
- Tested SHA: `a73334616543243245f0e63f2f845d1c31dd9e0c`
