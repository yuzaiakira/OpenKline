# OpenKline Phase 16.0.3 — Headless Replay Dispatch, Snapshot Allocation Integrity, and Benchmark Fidelity

Status: **INTERNAL IMPLEMENTATION VERIFIED — INHERITED GATES OPEN**

This report records the internal Phase 16.0.3 implementation and local
verification. It does not approve a public API, close the Phase 15.5 release
gate, establish browser/device compatibility, or authorize publication.

## Scope and authorization

Phase 16.0.3 was executed under the owner's explicit Phase 16.0 internal
implementation authorization recorded after the Phase 16.0 research design.
The work is limited to the internal replay-execution research session,
correctness tests, deterministic benchmark instrumentation, and supporting
documentation.

The implementation does not add root-package or React-package exports, alter
the protected public API baseline, change licensing, connect to brokers, submit
live orders, publish npm packages, create tags/releases, or begin Phase 16.1.
All executions described here are simulated executions and must not be
interpreted as observed exchange transactions.

## Revision and repository state

| Item | Value |
| --- | --- |
| Starting `origin/main` | `dc82603f937e6c4726c8992f04cc470f55bff508` |
| Implementation commit | `a50fea743432b6d859c9ba2692155d3fd0042ef6` |
| Branch | `main` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Commit message | `perf(research): avoid headless snapshot dispatch allocations` |
| Push target | `origin/main` |

The implementation commit was pushed immediately after its verification. The
documentation/audit commit containing this report is the final repository
commit for this delivery and is recorded in the Git handoff accompanying this
report. No history was rewritten and no force-push was used.

## Baseline reproduction and root cause

Before changing the dispatch path, an instrumented six-event deterministic
session was run with no subscribers. The session started, advanced through the
initial source-status and Level-2 events, submitted one market order, completed
replay, and counted calls to `getSnapshot()`:

```json
{"subscribers":0,"snapshotCalls":8,"orderStatus":"fully-simulated","fillCount":1,"processedEventIndex":5,"state":"completed"}
```

The replay state transition was correct, but `emit()` materialized a defensive
snapshot even when there was no observer to receive it. That created avoidable
allocation and nested-copy work in headless research and benchmark sessions.

The focused implementation is:

```ts
if (this.disposed || this.listeners.size === 0) return;
const snapshot = this.getSnapshot();
for (const listener of [...this.listeners]) listener(snapshot);
```

The fast path changes only observer dispatch allocation. It does not change
the synchronous replay ordering, controller state, financial calculations,
decision journal, order lifecycle, diagnostics, or cache invalidation rules.

The equivalent post-fix headless correctness test observed zero snapshot
materializations while still verifying the completed fill and lifecycle state.

## Observer contract and lifecycle verification

The focused tests cover the following behavior:

| Scenario | Result |
| --- | --- |
| Zero subscribers | PASS — no snapshot is materialized during headless dispatch. |
| One subscriber | PASS — event and seek notifications retain the existing snapshot contract. |
| Multiple subscribers | PASS — every listener receives the same snapshot object for one notification. |
| Unsubscribe during notification | PASS — the shallow listener copy preserves the in-flight notification and prevents later notifications. |
| Repeated subscribe/unsubscribe | PASS — `Set` semantics make repeated registration idempotent and cleanup deterministic. |
| Late observer | PASS — a listener added after earlier events receives later events and seek notifications. |
| Callback exception | PASS — callback errors continue to propagate to the caller; dispatch does not silently swallow them. |
| Disposal | PASS — listeners and replay/controller references are released; repeated disposal is safe and post-disposal use is rejected. |
| Nested snapshot reads | PASS — callback reads observe the current cursor and nested data remains defensively isolated. |
| Backward/forward seek | PASS — observer and headless exports remain equivalent after reconstruction. |

The tests also mutate returned ledger, position, order-fill, fill-quality,
source, journal, diagnostic, and decision objects and verify that subsequent
reads are unaffected. Revision changes invalidate the canonical snapshot cache
before submit/cancel and replay transitions, preventing a headless fast path
from exposing stale state later.

Focused research-execution correctness tests: **15 passed, 0 failed**.

## Schema-4 benchmark protocol

The benchmark was rewritten as schema `4` to avoid conflating observer
dispatch with replay processing. It uses deterministic synthetic tapes and
separate profiles for zero, one, and four observers; deterministic
decision-heavy submit/cancel work; Level-2-heavy updates; 25 explicit full
snapshot reads; and a fixed 14-event corrective scenario. The size workloads
contain one source-status event, one Level-2 snapshot, and the remaining
trade events:

| Workload | Event composition | Samples |
| ---: | --- | ---: |
| 1,000 | 1 source status, 1 book snapshot, 998 trades | 5 |
| 10,000 | 1 source status, 1 book snapshot, 9,998 trades | 5 |
| 100,000 | 1 source status, 1 book snapshot, 99,998 trades | 3 |

The fixed corrective tape contains 14 events: one source status, one book
snapshot, and twelve trades. It independently checks partial market fill,
cancellation, repeated submit/cancel decisions, bounded journal retention,
backward/forward reconstruction, and the reference ledger's cash and cost
basis.

Command:

```text
npm run benchmark:research
```

Environment: Linux x64, Node `v24.19.0`, `--expose-gc`, forced GC available.
The run was executed at implementation commit
`a50fea743432b6d859c9ba2692155d3fd0042ef6`. All values below are milliseconds
unless a unit is shown; each cell is median / p95.

### Size workload results

| Events | Headless processing | One observer | Four observers | Decision-heavy | Book-heavy | Headless full seek |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 19.967 / 21.526 | 33.772 / 35.737 | 33.159 / 37.952 | 21.789 / 22.761 | 13.829 / 14.395 | 10.400 / 11.339 |
| 10,000 | 363.095 / 369.929 | 458.752 / 496.063 | 451.914 / 459.400 | 457.101 / 460.987 | 82.696 / 101.529 | 363.011 / 382.546 |
| 100,000 | 2,252.135 / 2,265.118 | 3,110.085 / 3,188.885 | 3,090.442 / 3,229.818 | 8,241.392 / 8,737.376 | 807.513 / 912.118 | 1,404.189 / 1,437.085 |

The one-observer/four-observer notification counts were 1,004/4,016 at 1k,
10,004/40,016 at 10k, and 100,004/400,016 at 100k. Headless notification
counts were zero. Final exports for one and four observers matched the
headless export at every size. Full snapshot reads were measured separately:

| Events | Headless full snapshot reads | Decision-heavy full snapshot reads |
| ---: | ---: | ---: |
| 1,000 | 0.037 / 0.250 | 0.276 / 0.360 |
| 10,000 | 0.043 / 0.188 | 5.601 / 6.184 |
| 100,000 | 0.055 / 0.070 | 36.743 / 42.468 |

The benchmark also records tape construction, session construction, order
submission, decision submission/cancellation, processing-per-event,
serialization, disposal, and heap values in the machine-readable result.

### Fixed corrective microbenchmark

Seven samples were run for the fixed 14-event scenario:

| Metric | Median / p95 |
| --- | ---: |
| Construction | 1.067 / 2.203 ms |
| Processing | 0.512 / 1.586 ms |
| Cancellation and repeated submit/cancel | 0.278 / 0.913 ms |
| Backward/forward seek reconstruction | 0.860 / 1.814 ms |
| Serialized scenario size | 10,954 / 10,954 bytes |
| Retained journal entries | 4 / 4 |
| Journal evictions | 21 / 21 |
| Retained heap after disposal delta | 124,784 / 508,064 bytes |

Complete orders, fills, ledger, journal, diagnostics, and lifecycle state
matched after reconstruction and against the independent reference ledger.
The benchmark unsubscribed observers, disposed sessions twice, rejected
post-disposal use, and retained no simulator-owned subscriptions or Workers.
These are internal Node-session checks; chart canvas cleanup remains a
separate browser benchmark responsibility.

The machine-readable result for this run was saved outside the repository at
`/tmp/openkline-phase16-0-3-benchmark-final.json`. The result uses schema 4,
reports `gitSha` `a50fea743432b6d859c9ba2692155d3fd0042ef6`, and reports
`forcedGc: true`.

These figures are reproducible evidence for the synthetic workload, not a
controlled schema-2/schema-3 before/after claim, exchange-performance claim,
or public support target. Full reconstruction remains measured work rather
than a constant-time operation. No stochastic sampling, external market data,
broker connection, chart consumer, or public performance claim is implied.

## Verification matrix

### Passed local checks

| Command | Result |
| --- | --- |
| `npm test` | PASS — 352/352 Node tests. |
| `npm run typecheck` | PASS. |
| `npm run test:market-replay` | PASS — 17/17. |
| `npm run api:inventory` | PASS — packages and runtime/type export inventory generated. |
| `npm run studio:check` | PASS — core 133 files, Studio 17 files audited. |
| `npm run package:check` | PASS — 534 files, 645.2 kB package, 3.8 MB unpacked. |
| `npm run package:smoke` | PASS — local tarball installed and consumed as ESM. |
| `npm run package:audit` | PASS — no runtime dependencies; license status remains pending owner approval. |
| `npm run package:portability` | PASS — Node `v24.19.0`, npm `11.9.0`, zero runtime dependencies. |
| `npm run distribution:check` | PASS — package SHA `5915544c9fcfe54e5df09176195c736646b5a44b`. |
| `npm run benchmark:research` | PASS — schema 4, 1k/10k/100k, observer parity, and fixed corrective parity. |
| `npm run benchmark:market-replay` | PASS — existing 1k/10k/100k market-replay benchmark and cleanup checks. |
| `npm run benchmark:order-flow` | PASS — deterministic 1k/10k/100k analytics and order-book benchmarks. |
| `npm run benchmark:order-flow:browser` | PASS — system HeadlessChrome 154; cleanup and Canvas2D measurements recorded. |
| `npm run benchmark:multi-chart` | PASS — system HeadlessChrome 154; dual-chart synchronization and zero remaining canvases. |
| `npm run benchmark:browser` | PASS — system HeadlessChrome 154; 100k plain Canvas2D 61.66 FPS median result and cleanup recorded. |
| `npm run stress:ci` | PASS — Node and browser stress; zero orphan workers and zero remaining canvases. |
| `npm run test:browser` | PASS — 35/35 Chromium tests using the available system browser. |
| `npm run test:react:browser` | PASS — 38/38 Chromium tests using the available system browser. |
| `npm run test:react:production` | PASS — production build and 1/1 Chromium production check. |
| `npm --prefix examples/nextjs-app-router run build` | PASS — Next.js 16.4.3 webpack build. |

### Open or environment-blocked checks

| Command or gate | Result and evidence |
| --- | --- |
| `npm run api:check` | OPEN — no removals, but the protected baseline reports changed hashes for `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions`; no baseline approval was assumed. |
| `npm run api:diagnostics` | `PASS_ADDITIVE_REVIEW_REQUIRED` — same three changed hashes, no removal findings. |
| `npm run browser:verify` | BLOCKED — Playwright `1.64.1` could not find its managed Chromium, Firefox, WebKit, mobile-Chrome, or mobile-Safari executables. The command produced 0 discovered/expected tests and is not a pass. |
| Official Firefox/WebKit/mobile Safari | NOT VERIFIED — managed browser artifacts are unavailable in this cloud environment. System Chromium results must not be generalized to these engines or to physical devices. |
| Accessibility, physical-device, licensing/legal, release, and npm publication gates | OPEN / OUT OF SCOPE — no claims were made and no publication action was taken. |

The browser limitation is an artifact-availability limitation, not a test
failure result. No arbitrary browser binary, TLS bypass, or untrusted
substitution was used.

## API, package, and distribution status

The internal replay-execution contracts remain outside public package exports.
The package checks passed and the local distribution audit reports 534 package
files, no runtime dependencies, and package SHA
`5915544c9fcfe54e5df09176195c736646b5a44b`. The generated API inventory and
distribution audit were refreshed for implementation commit `a50fea...`.

The API baseline is intentionally not modified by this phase. Because the
existing compatibility check still reports three changed hashes relative to
its protected baseline, the API acceptance gate remains open pending the
owner's separate review. This report does not treat an additive-only result as
automatic baseline approval.

## Acceptance matrix

| Acceptance criterion | Status |
| --- | --- |
| Reproduce redundant no-observer snapshot materialization before the fix | PASS — 8 calls in the instrumented baseline session. |
| Skip snapshot materialization for zero observers | PASS — focused test observed zero calls. |
| Preserve one- and multi-observer financial/export parity | PASS — one and four observers matched headless exports at 1k/10k/100k. |
| Preserve shared snapshot identity per notification | PASS. |
| Preserve listener mutation, errors, late observers, and disposal semantics | PASS. |
| Preserve nested defensive reads and cache invalidation | PASS. |
| Run actual schema-4 benchmarks at 1k/10k/100k | PASS. |
| Run fixed 14-event correctness benchmark separately | PASS. |
| Pass full Node, type, package, stress, and local Chromium verification | PASS, with the exact command results above. |
| Official Firefox/WebKit/mobile-browser verification | BLOCKED by unavailable managed artifacts. |
| Protected public API baseline | OPEN — review required. |
| Public exports, live execution, npm/release publication, licensing adoption | NOT AUTHORIZED / NOT IN SCOPE. |

## Phase status and remaining debt

Phase 16.0.3 internal implementation is complete and verified for the
supported local Node and available system-Chromium checks. The phase does not
close the broader Phase 16.0 or Phase 15.5 release gates. Remaining technical
and governance debt includes:

- Full seek/reconstruction remains measured and is not constant time.
- Schema 4 intentionally reports full reconstruction; checkpoint/warm-seek
  optimization is not claimed by this phase.
- The protected API baseline still requires owner review for the three changed
  hashes.
- Official Playwright Firefox, WebKit, and mobile-browser evidence is blocked
  by the current cloud environment.
- Physical-device, accessibility, legal/licensing, npm publication, release,
  and public-support decisions remain open.
- The benchmark is synthetic and internal; its numbers are not exchange or
  public product performance guarantees.

No Phase 16.1 work was started. The next step requires resolving the open
acceptance and authorization gates rather than treating this internal
milestone as a public release.
