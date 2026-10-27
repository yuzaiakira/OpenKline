# OpenKline Phase 8.8.8 — Evidence-Driven Studio Compatibility Repair

Status: **OPEN — NOT RELEASE READY**

This report records the implementation and local verification boundary for
Phase 8.8.8. It does not convert focused diagnostics into cross-browser
compatibility evidence, and it does not close any inherited accessibility,
physical-device, licensing, or release-authorization gate.

## Scope and provenance

The accepted Phase 8.8.7 evidence pack is the sanitized repository pack at
`docs/evidence/browser/phase-8-8-7/`. Its validator passes, but its behavioral
result remains 34 focused records with 9 record passes and 25 record failures
(26 unique identities: 8 passing and 18 failing). The pack explicitly says
that no previous failure is certified resolved and that the full Studio matrix
was not executed.

The Phase 8.8.7 trusted run used Playwright 1.64.1 and the official image
`mcr.microsoft.com/playwright:v1.64.1-noble`, digest
`sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`.
The current cloud environment cannot provide those managed browser binaries;
it is not a substitute for the trusted Manjaro rerun.

The behavioral/test repair boundary is:

- `b631b92c769d8e1e9892545c896381299c6f8bcd` — touch drawing fallback,
  pointer de-duplication/cleanup, and a narrow-layout primary-pane test
  contract correction.
- `95cbf47aede8046b03fba9ce476ab5e211359989` — bounded overflow and input
  diagnostics refinement.

The report and audit update is intentionally separate from those behavioral
commits.

## Implemented changes

| Area | Change | Boundary |
| --- | --- | --- |
| Chart input | Canvas drawing now has a non-passive `touchstart` fallback for environments where the synthetic pointer path is incomplete. Pointer de-duplication prevents the fallback from creating a second point; `touchend`/`touchcancel` and chart destruction clear the transient state. | `src/chart.ts` |
| Drawing/replay test contract | Narrow multi-pane tests select coordinates inside the visible primary chart pane instead of assuming that a percentage of the full canvas is in that pane. The test also waits for a ready, sufficiently sized canvas before the gesture. | `tests/react-browser/studio.spec.ts`, `tests/react-browser/multi-chart-studio.spec.ts` |
| Diagnostics | Failure-only, bounded overflow element records and pointer/touch traces were added. Diagnostics remain sanitized and bounded; they do not alter production layout or suppress browser warnings. | `tests/react-browser/studio-test.ts` |
| Evidence accounting | The Phase 8.8.7 schema, policy, and validator tests remain enforced. No old failure row was relabeled as resolved. | `scripts/browser-evidence-validator.mjs`, `docs/evidence/browser/phase-8-8-7/` |
| Project documentation | The PDR and roadmap identify the repair as in progress and preserve the open trusted-browser and release gates. | `docs/PDR.md`, `docs/ROADMAP.md` |

### Local diagnosis

In the local system-Chromium diagnosis, the narrow multi-pane canvas was about
374×350 CSS pixels while the primary pane occupied only the upper portion of
the canvas. The former test coordinates landed in the indicator/volume panes:
the canvas received the gesture, but no drawing was created. The revised
coordinates are explicitly within the visible primary pane. This is a local
test-contract diagnosis, not proof that managed Mobile Safari or WebKit has
been repaired.

## Verification performed

All results below are from the current cloud workspace and are reproducible
local checks. They are not trusted-machine managed-browser evidence.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | **PASS — 163/163** | Node, integration, and evidence-validator tests |
| `npm run typecheck` | **PASS** | Core, React, and test type checks |
| `npm run studio:check` | **PASS** | Core remains independent of React/Next runtime dependencies |
| `npm run evidence:browser:check` | **PASS** | All versioned packs validate; 8.8.7 remains 34 records / 9 pass / 25 fail |
| Focused React Studio Chromium run | **PASS — 13/13** | `studio.spec.ts` and `multi-chart-studio.spec.ts`; local system `/usr/bin/chromium` only |
| `npm run api:check` | **PASS** | No removed or changed public signatures; additive exports empty |
| `npm run package:portability` | **PASS** | Zero core/React runtime dependencies; workers present |
| `npm run package:smoke` | **PASS** | Packed ESM consumer installation/import; no publication |
| `npm run distribution:check` | **PASS** | 394 files, no problems; SHA-1 `09f306ba850fcccdc9181a52b8094c8c8d171901` |
| `npm run release:check` | **BLOCKED overall** | Engineering checks passed; repository was dirty during the run, managed-browser gate blocked, and manual gates remain open |
| `npm run release:readiness` | **NOT READY** | Current summary: `artifacts/release-readiness/2026-10-27T09-02-11-362Z/summary.json` |

The release-readiness run recorded PASS for API compatibility, typecheck,
unit/integration tests, local Chromium diagnostics and React browser tests,
Canvas2D benchmark, package/distribution/smoke checks, consumer smoke,
versioned evidence validation, license inventory, npm audits, and the Next.js
production build. It recorded the managed-browser gate as **BLOCKED** because
the required Playwright-managed binaries are unavailable in this environment.
The repository gate was dirty during that run because generated audit/build
files had not yet been reconciled; this report commit reconciles the intended
distribution audit and excludes generated build changes.

## Performance and memory observations

The release-readiness Canvas2D benchmark completed without a detected
regression. It used local headless system Chromium 154.0.0.0 and is not a
cross-browser performance claim:

| Candles | FPS | Frame interval median / p95 | Frame work median / p95 | Load |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 63.48 | 16.7 / 16.9 ms | 1.8 / 2.9 ms | 20.5 ms |
| 10,000 | 63.05 | 16.7 / 17.0 ms | 1.3 / 2.0 ms | 104.6 ms |
| 100,000 | 62.99 | 16.6 / 17.0 ms | 1.2 / 1.4 ms | 1,492 ms |

The same run observed 548,897,921 bytes before destruction and 2,806,174
bytes after destruction, with zero remaining canvases. These are observations
from one local benchmark run, not capacity guarantees. No new optimization was
introduced; the existing append/render paths were preserved.

## Browser and acceptance matrix

| Criterion | Status | Reason/evidence |
| --- | --- | --- |
| Evidence pack integrity and sanitization | **PASS** | Phase 8.8.7 repository pack validator passes |
| Touch drawing fallback and lifecycle cleanup implemented | **IMPLEMENTED** | `src/chart.ts` and local tests |
| Narrow primary-pane drawing test contract | **PASS locally** | 13/13 system-Chromium Studio tests |
| Bounded overflow/input diagnostics | **IMPLEMENTED / TESTED** | Diagnostics are failure-only and bounded |
| Chromium managed-browser rerun at current source | **NOT TESTED** | Required managed binary unavailable here |
| Firefox managed-browser rerun | **NOT TESTED / BLOCKED** | Required trusted environment unavailable |
| WebKit managed-browser rerun | **NOT TESTED / BLOCKED** | Required trusted environment unavailable |
| Mobile Chrome managed emulation | **NOT TESTED / BLOCKED** | Required trusted environment unavailable |
| Mobile Safari managed emulation | **NOT TESTED / BLOCKED** | Required trusted environment unavailable |
| ResizeObserver behavior | **OPEN** | Prior WebKit/Safari evidence observed loop warnings; no speculative suppression was added |
| Async paper/alert/screener/optimization states | **OPEN** | Prior focused failures remain unreconciled |
| Full Studio matrix | **OPEN** | Phase 8.8.7 was focused-only; current trusted full rerun is pending |
| Formal accessibility and visual approval | **OPEN / NOT TESTED** | No manual conformance or owner-approved baseline evidence |
| Physical Android/iOS devices | **NOT TESTED** | No physical-device evidence |
| License, third-party notices, and release authorization | **OPEN** | Owner/legal approval is still required |

## Decision

Phase 8.8.8 is **not closed**. The repair is narrowly implemented and locally
validated, but the same trusted Playwright-managed projects must be rerun at
the current source before any Phase 8.8.7 failure can be marked resolved. The
full Studio matrix, evidence reconciliation, and all inherited release gates
remain open. No Phase 3 start, package publication, tag, release, or GitHub
Actions workflow is authorized by this work.
