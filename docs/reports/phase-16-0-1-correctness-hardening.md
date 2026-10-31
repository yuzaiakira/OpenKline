# Phase 16.0.1 — Correctness Hardening Verification

Status: **INTERNAL CORRECTNESS HARDENING VERIFIED — EXTERNAL GATES OPEN**

Verification date: 2026-10-31

## Authorization boundary

The authorized owner approved internal Phase 16.0 implementation at reviewed
design commit `76ad54525958e5689b752b49855209beacdb37ee`. That authorization
also covers corrective maintenance needed to make the internal simulator
reliable: numerical, causality, lifecycle, regression, and benchmark work.

This increment remains strictly internal. It does not authorize new public
exports, protected API-baseline adoption, licensing changes, npm publication,
tags/releases, broker connectivity, live execution, or closure of Phase 15.5
compatibility, legal, accessibility, or release gates. Simulated executions
remain separate from observed exchange transactions.

## Starting point and pushed revisions

| Revision | SHA | Result |
| --- | --- | --- |
| Phase 16.0 verified baseline | `d0bb09d06a7fa6deadacd1caff7306bce4e8dd5e` | Exact starting `origin/main` |
| Corrective implementation | `f27f023052c8ec303f235d6b439dae0734fbae7a` | Source contracts, engine fixes, focused tests; pushed |
| Corrective benchmark | `0b980ed1ef8d6807f51e1f7f553de5f9d2395d53` | Deterministic corrective scenario; pushed |
| Final documentation | Recorded after this report is committed | Documentation and generated audit evidence |

All implementation commits were authored and committed as `Akira Yuzai
<yuzai.akira@gmail.com>` and pushed directly to `origin/main` under the
owner-authorized internal workflow. No force-push or history rewrite was used.

## Reproduced defect and root cause

Before the corrective implementation, the focused cancellation fixture was
run against the Phase 16.0 engine with:

```text
npm exec -- tsc -p tsconfig.test.json && node --test test-dist/tests/research-execution-correctness.test.js
```

The backward/forward cancellation assertion failed: a cancelled order became
executable after reconstruction (`actual fills: 1`, `expected: 0`). The root
cause was that cancellation was a runtime mutation and was not represented as
a durable replay decision. Reconstructing from the tape therefore replayed the
submission without replaying the cancellation.

The corrective test now passes the same scenario in both directions and
compares orders, fills, reservations, ledger, and journal state—not only final
equity.

## Implemented corrective scope

### Durable decision history

- Added a discriminated submit/cancel decision union.
- Every decision carries a stable decision ID, monotonic ordinal, replay
  cursor, event identity, clock, and scenario identity.
- Cancellation is replayed through the canonical decision activation path and
  releases its reservation exactly once.
- Same-cursor decisions use deterministic ordinal/ID ordering.
- Mutations against a future replay branch fail with a future-decision error;
  they are not silently moved to an earlier cursor.

### Pending capacity and audit retention

- The `maxPendingOrders` boundary now includes the candidate submission. A
  full capacity rejects the candidate before reservation (`pendingCount >=
  limit`). Rejected, cancelled, and terminal orders do not consume capacity.
- Journal IDs use a monotonic sequence, preventing collisions after bounded
  eviction or replay reconstruction.
- Snapshot/export metadata reports retained entries, total emitted entries,
  evictions, and whether the retained audit window is complete.

### Financial safety

The engine asserts after reserve, release, rejection, cancellation, fill,
split, and dividend transitions that:

- `availableCash = cash - reservedCash`;
- cash, reserved cash, quantities, reserved quantities, and cost basis are
  finite and non-negative;
- reserved position never exceeds held position; and
- a reservation cannot be released twice.

These are internal fail-closed accounting invariants. They do not claim that a
historical exchange would have filled an order.

### Provenance, corporate actions, and sessions

- Corporate-action decisions are keyed by instrument/action logical identity
  and source generation. Ambiguous generations fail closed unless an exact
  authoritative source is selected.
- Duplicate deliveries of one source revision are idempotent; a later revision
  after application is a quality failure rather than a silent rewrite.
- Dividend entitlement is fixed at the ex-dividend boundary. A later split
  does not retroactively rescale the entitlement.
- Known closed or unresolved session boundaries make execution indeterminate
  until a causal reopen boundary is observed.
- Simulated results remain outside canonical market trades, CVD, Footprint,
  order-book history, and the replay tape.

## Verification results

### Focused and full regression

| Check | Result |
| --- | --- |
| Focused Phase 16.0.1 correctness suite | **PASS — 20/20** |
| Full `npm test` | **PASS — 345/345** |
| `npm run typecheck` | **PASS** |
| `npm run stress:ci` | **PASS** — 4,000 Node events; 0 browser orphan failures, 0 Worker orphans, 0 remaining canvases |
| `npm run studio:check` | **PASS** |

The full suite includes the eight new corrective fixtures and all prior
research, replay, paper-trading, chart, package, and evidence tests.

### Corrective research benchmark

Command:

```text
npm run benchmark:research
```

Environment: Linux x64, Node `v24.19.0`, forced GC available. The benchmark
ran at `0b980ed1ef8d6807f51e1f7f553de5f9d2395d53` with schema version 2. The
base workload uses deterministic source-status, Level-2, and trade events;
the corrective workload submits a partial market order, cancels it, exercises
bounded journal retention, seeks backward/forward, and compares complete
state with `ReferenceExecutionLedger`.

| Events | Samples | Processing median/p95 (ms) | Construction median/p95 (ms) | Seek median/p95 (ms) | Serialization median/p95 (ms) | Heap before dispose median/p95 (MiB) | Retained after dispose median/p95 (MiB) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 5 | 41.84 / 45.13 | 34.48 / 41.49 | 12.52 / 13.34 | 0.086 / 0.276 | 7.92 / 7.99 | 0.109 / 0.627 |
| 10,000 | 5 | 558.41 / 576.17 | 262.72 / 268.82 | 331.03 / 376.16 | 0.076 / 0.080 | 34.35 / 34.66 | 0.253 / 0.275 |
| 100,000 | 3 | 3,958.32 / 4,004.49 | 2,681.97 / 2,684.06 | 1,399.19 / 1,493.43 | 0.092 / 0.096 | 142.05 / 142.11 | 0.235 / 0.241 |

Corrective scenario metrics from the same run:

| Events | Construction median/p95 (ms) | Processing median/p95 (ms) | Cancellation median/p95 (ms) | Seek median/p95 (ms) | Retained journal entries | Evictions | Retained heap after correction median/p95 (bytes) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.886 / 1.025 | 0.213 / 0.356 | 0.424 / 0.907 | 0.435 / 0.797 | 4 | 21 | 73,768 / 135,752 |
| 10,000 | 0.787 / 0.950 | 0.181 / 0.210 | 0.456 / 0.504 | 0.559 / 0.584 | 4 | 21 | 0 / 0 |
| 100,000 | 0.825 / 0.890 | 0.151 / 0.152 | 0.426 / 0.459 | 0.573 / 0.842 | 4 | 21 | 0 / 0 |

The previous Phase 16.0 processing medians were 43.66, 530.25, and 3,856.63
ms for 1k/10k/100k. The corrected measurements are not a controlled
before/after performance claim because the correctness implementation,
benchmark schema/scenario, and process state changed. No 500k workload was
run. These measurements are internal simulator evidence, not broker,
exchange, chart-FPS, or production-capacity claims.

### Existing chart, replay, and Order Flow baselines

The separate existing benchmarks were rerun without changing their chart or
Order Flow subsystems:

- `npm run benchmark:market-replay`: **PASS** for 1k/10k/100k; the current
  100k median validation/construction/cold-seek/warm-seek readings were
  2,434.48 / 2,491.30 / 957.61 / 129.51 ms.
- `npm run benchmark:order-flow`: **PASS** for deterministic 1k/10k/100k
  trade/CVD/Footprint and order-book workloads.
- `npm run benchmark:order-flow:browser`: **PASS** on system Chromium for
  real Canvas2D workloads; every scenario cleaned `1 → 0` canvases and
  retained `0` active Workers.
- `npm run benchmark:multi-chart`: **PASS** on system Chromium; dual 10k
  visual navigation was 16.6 ms median and dual 100k visual navigation was
  38.1 ms median, with zero remaining owned canvases.
- `npm run profile:multi-chart`: **PASS**; the dominant profiled work was
  visible-data construction and Canvas2D full rendering, with crosshair-only
  paths remaining sub-millisecond in this run.
- The release-check Canvas2D run measured system Chromium 100k plain rendering
  at 61.75 FPS and zero canvases after disposal. These are environment- and
  workload-specific measurements, not universal claims. Dense fit-content and
  cross-browser gates remain open.

## API, package, and distribution boundary

| Check | Result |
| --- | --- |
| `npm run api:inventory` | **PASS**; baseline not written |
| `npm run api:diagnostics` | **PASS_ADDITIVE_REVIEW_REQUIRED** |
| `npm run api:check` | **OPEN / expected failure**; no removals, three inherited hash changes in `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions` |
| Protected `docs/audits/public-api-baseline.json` | **UNCHANGED** |
| `npm run package:check` | **PASS**; 534 files, 644,008-byte package, 3,802,674-byte unpacked, shasum `a163082a6703ad3667a7a3e9370969dca5ca4f46` |
| `npm run package:audit` | **PASS**; project license remains `pending-owner-approval` |
| `npm run package:portability` | **PASS** |
| `npm run package:smoke` | **PASS**; local packed ESM consumer installed |
| `npm run distribution:check` | **PASS**; no distribution problems |

The research module remains absent from the root runtime/type export surface.
The standard package artifact audit still includes compiled internal paths in
the broad `dist` package contents; this is a packaging-boundary limitation to
review before any public API adoption, not a new public export. No license,
package metadata, root export, or protected baseline was changed.

## Browser and environment results

The available direct browser was system-installed Chromium
`/usr/bin/chromium`, version `154.0.8037.57`, driven through Playwright
`1.64.1` with the explicit system-browser configuration:

| Check | Result |
| --- | --- |
| `npm run test:browser` | **PASS — 35/35** |
| `npm run test:react:browser` | **PASS — 38/38** |
| `npm run test:react:production` | **PASS — 1/1** |
| `npm run browser:diagnostic` (inside `release:check`) | **PASS — 70/70** across Chromium and mobile-Chrome emulation |
| `npm run browser:verify` | **BLOCKED**; official Playwright-managed launch prerequisites absent |

The portable five-project run did not execute assertions. Its current
environment records missing managed executables at:

- Chromium: `/home/agent/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`
- Firefox: `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox`
- WebKit: `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`

The command exited with code 1 and reported launch errors for all five
projects. System Chromium was not substituted for Firefox, WebKit, or mobile
Safari. No physical-device, formal accessibility approval, or visual approval
was inferred from the local Chromium results.

`npm run release:check` completed its typecheck, 345-test Node suite, local
Chromium diagnostic, benchmarks, package audits, package smoke, and Next.js
production build. It remained **BLOCKED** only at its independent consumer
preview browser stage because the Playwright-managed Chromium executable was
absent. This is an environment limitation, not a passing release gate.

## Acceptance matrix

| Criterion | Status | Evidence or limitation |
| --- | --- | --- |
| Owner-authorized internal scope | **PASS** | Work stayed inside internal research implementation, tests, benchmark, and docs |
| Pre-fix cancellation defect reproduced | **PASS** | Cancelled order previously filled after reconstruction; actual 1 vs expected 0 |
| Durable cancellation across seek | **PASS** | Focused parity fixture and full suite |
| Pending capacity boundary | **PASS** | Candidate is rejected at full capacity without reservation |
| Same-cursor ordering and future-branch guard | **PASS** | Deterministic decision ordinals and rejection tests |
| Bounded journal identity and completeness | **PASS** | Monotonic IDs, 4 retained/21 evicted corrective fixture, explicit metadata |
| Financial reservation invariants | **PASS** | Multi-order cash/position invariant fixture |
| Corporate-action source identity and dividend causality | **PASS** | Ambiguity fails closed; entitlement remains fixed across split |
| Session eligibility | **PASS** | Closed session fails closed and causal reopen permits processing |
| Reference parity and observed-data isolation | **PASS** | Complete state comparison; no canonical market-data mutation |
| 1k/10k/100k corrective benchmark | **PASS** | Forced-GC internal measurements above |
| Full Node regression and stress cleanup | **PASS** | 345/345; zero browser orphan resources in stress |
| Root public API and protected baseline | **PASS** | Research types not root-exported; baseline not rewritten |
| Package/distribution checks | **PASS** | Local pack, audit, portability, smoke, and distribution checks |
| System Chromium and mobile emulation | **PASS** | 35/35, 38/38, 1/1, and 70/70 diagnostic evidence |
| Official Firefox/WebKit/Mobile Safari | **BLOCKED** | Managed Playwright binaries unavailable; no assertions executed |
| Physical devices, formal accessibility, visual approval | **NOT TESTED / OPEN** | Requires separate approved environment and review |
| Additive API approval | **OPEN** | Three inherited declaration hash changes require owner review |
| Licensing, npm, tags, releases, live broker | **NOT AUTHORIZED / NOT PERFORMED** | Outside the explicit internal scope |

## Remaining technical debt and readiness

The internal correctness gate is complete for the authorized Phase 16.0.1
scope. Remaining items are deliberately open:

1. obtain an approved environment containing the exact Playwright-managed
   browser artifacts and rerun the official five-project suite;
2. resolve or explicitly approve the inherited additive API baseline changes;
3. review whether package contents should exclude internal compiled research
   paths before a future public API decision;
4. complete the independent legal, accessibility, visual, physical-device,
   licensing, and release gates; and
5. obtain separate owner authorization before any Phase 16.1/public API,
   broker, Worker, Studio, or live-execution expansion.

Phase 16.0.1 is therefore **ready as an internally verified corrective
foundation**, but Phase 15.5 external acceptance remains open and no public or
live-execution readiness claim is made.

## Git verification

The final documentation commit and the preceding implementation/benchmark
commits must be pushed to `origin/main` with author and committer
`Akira Yuzai <yuzai.akira@gmail.com>`. Final handoff verification records
`HEAD == origin/main`, a clean working tree, and no GitHub Actions, force-push,
publication, tag, release, or license adoption.
