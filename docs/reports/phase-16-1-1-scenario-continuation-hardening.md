# Phase 16.1.1 — Scenario Continuation and Resource Hardening

Status: **Implemented and internally verified; public, legal, browser-device,
and release gates remain open**

This report records the authorized internal corrective maintenance increment
for Phase 16.1. It does not authorize or claim Phase 16.2, Studio, Worker,
broker, live-execution, npm, release, licensing, accessibility, or physical
device work.

## Authorization and boundary

The owner authorized internal Phase 16.1 implementation at the reviewed
commit `76ad54525958e5689b752b49855209beacdb37ee`. Phase 16.1.1 was executed
from the verified Phase 16.1 main baseline:

| Item | Value |
| --- | --- |
| Starting SHA | `1feabe3e149f719ce503cbfcdb123d2b16313332` |
| Branch | `main` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Root/API baseline | Preserved; no Phase 16 contracts added to root exports |
| Publication | Not performed |

The work stayed within internal replay-causal research. Every order, fill,
ledger value, and diagnostic remains a simulated research result and is not
an observed exchange transaction.

## Reproduced defect and repair

Before changing the implementation, a deterministic six-event tape was used
to export a paused artifact containing one accepted order. A legitimate
artifact creator then changed the imported decision and order identifiers to
the otherwise-generated values `artifact-scenario-decision-2` and
`artifact-scenario-order-2`, recomputed the unauthenticated content hash, and
restored the artifact. Continuing the restored session generated the same
identifiers. The duplicate decision identity appeared twice and the order map
contained one entry because the new order overwrote the imported order.

The repair is deliberately narrow:

- restored decision and order IDs are registered as occupied identities;
- new decision/order allocation probes the occupied sets and skips imported
  collisions;
- imported IDs remain unchanged, while the reproduced continuation allocates
  `artifact-scenario-decision-3` and `artifact-scenario-order-3`;
- idempotent resubmission still returns the imported order, same-cursor
  ordering remains deterministic, and seek/backward/forward reconstruction
  retains the same decision journal;
- identity sets survive runtime reset/seek reconstruction and are cleared on
  disposal;
- duplicate decision/order records fail closed instead of overwriting maps.

## Implemented hardening

### Continuation and restoration

The focused continuation fixture restores a paused frontier, performs an
idempotent submit, adds a new limit order, advances the tape, cancels the new
order, seeks backward and forward, compares both reconstructed sessions, then
exports and restores a second artifact. It compares decisions, orders, fills,
ledger, journal retention, diagnostics, and cursor state.

`restoreResearchScenario` now owns the fresh session for the complete
construction/load/replay/export/evidence path. Load failures, frontier
mismatches, export failures, and evidence failures dispose the temporary
session. A normal expected-result mismatch is not treated as a construction
failure: it returns a usable session with status `mismatch`, which the tests
also verify.

### Bounded resources and input shape

The internal shared ceilings are:

| Resource | Ceiling |
| --- | ---: |
| Decisions | 100,000 |
| Journal entries | 100,000 |
| Pending-order capacity option | 100,000 |
| Replay depth | 10,000 |
| Bounded latency entries | 10,000 |
| Direct session identifier/reason strings | 4,096 characters |

Artifact validation retains lower configurable defaults and absolute limits for
serialized bytes, decisions, strings, arrays, and nesting. Assumption-level
journal/depth/pending/latency limits are checked against the same absolute
ceilings. Restore validates these values before constructing the execution
session.

Direct object artifacts are a strict data-only contract. Own accessor
descriptors, symbols, sparse arrays, non-enumerable fields, unexpected
prototypes, prototype-pollution keys, non-finite values, and unsupported
numeric values are rejected without invoking accessors. Callers must
materialize JSON-like data before validation; a Proxy is not claimed to be a
safe artifact input type. String input is parsed with the existing serialized
byte limit before validation.

### Schema-1 hash compatibility

The existing unauthenticated FNV-1a 64-bit content hash was preserved. Its
canonical implementation consumes JavaScript UTF-16 code units in
`charCodeAt` order, including non-ASCII input. This is an ordinary integrity
check only; it is not authentication, a signature, provenance, or permission
to execute a scenario. Unicode serialization and round-trip tests preserve
the same hash.

## Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | Core/React build and no-emit TypeScript checks |
| `npm test` | PASS | 362 passed, 0 failed, 0 skipped |
| Focused scenario artifact suite | PASS | 10 passed, 0 failed; includes continuation, limits, hostile shape, Unicode, and disposal tests |
| `npm run test:market-replay` | PASS | 17 passed, 0 failed |
| `npm run benchmark:research` | PASS | Phase 16.0 baseline workload rerun at `403ac9249bbd89c7b5d4fa694944b8d97e865372` |
| `npm run benchmark:research-scenario` | PASS | 1k/10k/100k; 3/3/2 samples; continuation and failed-restore paths included |
| `npm run api:inventory` | PASS | 319 runtime exports, 736 type exports; baseline not rewritten |
| `npm run api:diagnostics` | PASS with additive review required | No removals; three historical declaration hashes differ: `Chart`, `WorkspaceDocument`, `WorkspaceRestoreOptions` |
| `npm run api:check` | OPEN / expected failure | No removals; the same three inherited hash differences remain; no Phase 16.1.1 root export caused this |
| `npm run studio:check` | PASS | Core remains independent of React/Next runtime dependencies; Studio remains private |
| `npm run package:check` | PASS | Local dry-run pack completed; no publication |
| `npm run package:audit` | PASS / legal gate pending | 546 core package files; license remains owner/counsel gated |
| `npm run package:portability` | PASS | Node `v24.19.0`, npm `11.9.0`, no core runtime dependencies |
| `npm run distribution:check` | PASS | 546 files, 666,559 bytes, 3,918,528 unpacked bytes, no problems |
| `npm run package:smoke` | PASS | Local packed ESM consumer installed and imported successfully |
| `npm run test:browser` | PASS | Chromium 35/35 using the repository's configured `/usr/bin/chromium` |
| `npm run test:react:browser` | PASS | React/Studio Chromium 38/38 |
| `npm run test:react:production` | PASS | Next.js production build and Chromium 1/1 |
| `npm run stress:ci` | PASS | Node/browser stress; 0 orphan failures, 0 Worker orphans, 0 remaining canvases |
| Firefox/WebKit/Mobile Safari managed-browser suite | NOT VERIFIED / OPEN | Managed executables are absent in this cloud environment; no system-browser substitution was used |
| Physical-device and accessibility acceptance | OPEN | Outside this internal authorization and not claimed here |

Playwright reports version `1.64.1`. A dry-run lists managed Chromium 1248,
Firefox 1555, and WebKit 2370 artifacts, but the corresponding cache paths
were absent in this cloud environment. Chromium verification used the
repository's explicit system Chromium path; Firefox/WebKit and Mobile Safari
were not silently substituted. No TLS bypass, arbitrary binary, or repeated
blocked download attempt was used.

## Benchmark evidence

The continuation benchmark ran at commit
`403ac9249bbd89c7b5d4fa694944b8d97e865372` with Node `v24.19.0`, Linux x64,
forced GC, and sample roles `cold, warm, warm` for 1k/10k and `cold, warm`
for 100k. Values below are median / reported p95 in milliseconds unless
otherwise stated.

| Events | Decisions | Artifact | Full restore | Continuation restore | Continued submit | Continued re-export | Failed restore/cleanup | Heap retained delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 64 | 25,094 B | 94.608 / 100.611 | 61.259 / 67.343 | 0.083 / 0.092 | 3.469 / 3.724 | 54.965 / 58.471 | 887,472 / 1,776,128 B |
| 10,000 | 198 | 75,278 B | 1,030.819 / 1,120.049 | 570.145 / 598.455 | 0.130 / 0.141 | 8.981 / 9.426 | 535.625 / 544.359 | 6,189,352 / 6,300,848 B |
| 100,000 | 1,998 | 759,182 B | 20,376.884 / 20,376.884 | 6,445.149 / 6,445.149 | 0.850 / 0.850 | 100.136 / 100.136 | 6,316.162 / 6,316.162 | 61,888,696 / 61,888,696 B |

The 100k p95 is the maximum of two observations, not a stable tail estimate.
The retained heap value is process-level post-disposal delta after forced GC,
not a zero-leak proof or a universal memory claim. Full benchmark protocol and
the prior Phase 16.0 baseline are recorded in
`docs/benchmarks/replay-execution-research.md`.

## Commit and push verification

| Commit | Purpose | Push verification |
| --- | --- | --- |
| `2163676685d83ff6de77d4eae77b64ceb972ad8f` | Continuation identity, resource validation, restore cleanup, focused tests | Pushed to `origin/main` |
| `403ac9249bbd89c7b5d4fa694944b8d97e865372` | Continuation benchmark protocol and lifecycle measurements | Pushed to `origin/main` |
| Documentation commit | This report and the architecture/roadmap/benchmark/API-boundary updates | To be verified immediately after commit and push |

At each commit the configured author and committer were verified as
`Akira Yuzai <yuzai.akira@gmail.com>`. The final documentation commit must
remain on `main` with `HEAD == origin/main` and a clean working tree; the
handoff records its exact SHA after that push.

## Acceptance matrix

| Criterion | Status | Notes |
| --- | --- | --- |
| Reproduce and eliminate restored ID collisions | **Implemented / verified** | Deterministic before/after fixture; no order overwrite after repair |
| Schema-1 compatibility and stable imported IDs | **Verified** | Existing round trips and continuation preserve imported records |
| Deterministic continuation across submit/cancel/seek/replay | **Verified** | Two restored sessions and second artifact compare exactly |
| Market/limit/partial/rejected/cancel/idempotency coverage | **Verified** | Focused and inherited research suites |
| Receive-time/corporate-action/session behavior | **Verified** | Existing and focused replay tests remain green |
| Resource ceilings and rejection before restore construction | **Verified** | Engine and artifact parser share absolute ceilings |
| Strict direct-object data-only validation | **Verified** | Accessor, sparse, prototype, symbol, forbidden-key, numeric tests |
| Restore cleanup on all reachable failure paths | **Verified** | Load and post-replay failure instrumentation; mismatch preserved |
| UTF-16 FNV-1a compatibility | **Verified** | Unicode serialize/parse parity; semantics documented |
| Internal benchmark protocol and honest small-sample reporting | **Verified** | Cold/warm labels and two-sample p95 caveat recorded |
| Root public API and protected baseline unchanged | **Verified / gate remains open** | No new root export; inherited three declaration hashes still require review |
| Node/package/distribution checks | **Verified** | All listed local checks passed |
| Firefox/WebKit/Mobile Safari official browser evidence | **Open / not tested** | Cloud environment lacks managed executables |
| Legal, license, accessibility, physical-device, publication, release gates | **Open** | Outside authorized internal scope |
| Phase 16.2 | **Not authorized / not started** | No work performed |

## Readiness assessment

Phase 16.1.1 internal engineering is ready for owner review and can be
considered complete only for its authorized internal scope. The protected API
baseline, browser/device, accessibility, legal/licensing, publication, and
release gates remain open. The implementation does not make a public API or
cross-browser compatibility claim and does not authorize Phase 16.2.
