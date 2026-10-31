# Phase 16.1 — Scenario Reproducibility and Trusted Reconstruction

Status: **Implemented and internally verified; public/release gates remain open**

## Authorization and boundary

The authorized owner approved internal Phase 16.1 implementation at the
verified starting commit `03c021a062a9a011f7390ea68f4f9e151cafd478`. The
authorization covers versioned research scenario persistence, strict import
validation, tape/source binding, deterministic reconstruction, internal tests,
benchmarks, and documentation only.

It does not authorize public exports, protected API-baseline changes, Studio or
worker integration, broker or live execution, licensing changes, npm
publication, tags, releases, or closure of inherited browser, device,
accessibility, legal, or release gates. Every execution represented by this
feature is simulated research and must not be read as an observed exchange
transaction.

## Delivery summary

Phase 16.1 now provides an internal schema-1 artifact and reconstruction path:

- `createResearchScenarioArtifact` exports bounded assumptions, exact replay
  tape/source identity, replay policy and frontier, durable submit/cancel
  decisions, decision-history completeness, journal-retention metadata, and
  optional expected-result evidence.
- Canonical serialization and an unauthenticated FNV-1a 64-bit content hash
  detect ordinary corruption. The hash is not a signature or trust anchor.
- Strict validation rejects unknown fields, unsupported versions, cycles,
  prototype-pollution keys, non-finite/out-of-range numbers, excessive
  strings/arrays/depth/bytes, duplicate IDs, invalid references, invalid
  cancellation order, inconsistent frontiers, and inconsistent journal
  metadata.
- `restoreResearchScenario` validates the supplied tape and exact source
  generations, loads only validated decisions into a new internal session, and
  derives all orders, fills, journals, quality diagnostics, and ledger state by
  replaying the existing engine.
- Imported orders, fills, journals, diagnostics, ledger values, and expected
  results are never injected as authoritative state. Expected results are
  compared as evidence and produce `verified`, `mismatch`, or
  `no-expected-result`.
- Failed restores dispose their temporary session. The implementation remains
  internal to `src/research-execution` and does not alter root or React
  package exports.

The implementation was delivered in `d952574eee0d889f4170e8aefe95ffd8b16a04f`
and the reproducibility benchmark in
`7b0733f24fadd716e84f954604e26202a77d319a`.

## Artifact and trust model

The artifact is an input description for a deterministic research replay, not
an execution snapshot. A restore requires exact equality of tape ID,
fingerprint, tape version, ordering version, instrument IDs, source IDs and
source generations, plus venue and clock-policy compatibility. Receive-time
restoration fails closed when any required event has no receive timestamp.

Only the following imported fields influence reconstruction: validated replay
assumptions, the validated causal frontier, and validated submit/cancel
decisions. The validator also checks decision event IDs, cursors, times,
ordinals, idempotency keys, order references, cancellation ordering, and
frontier completeness. The existing replay and execution controllers retain
their event ordering, no-lookahead, source-isolation, corporate-action,
session-calendar, precision, cost, risk, liquidity-quality, and financial
reservation rules.

The optional `expectedResult` is intentionally advisory. A fake or tampered
expected result cannot alter the reconstructed result and is reported as a
fingerprint mismatch. The journal-retention record describes the presentation
history that was retained; it does not create missing historical entries.

## Verification performed

The focused Phase 16.1 suite contains seven tests and passed `7/7`:

1. complete market buy/sell artifact round-trip with confirmation that derived
   orders, fills, and ledger state are not serialized as authoritative input;
2. partial fills, cancellation, limit decisions, and bounded journal
   retention;
3. same-cursor ordering, idempotency, rejected orders, and incomplete history;
4. corporate-action/source identity and rejection of decisions beyond the
   recorded frontier;
5. fabricated expected-result evidence producing `mismatch` rather than
   injected state;
6. hostile unknown fields, integrity tampering, `NaN`, oversized values,
   arrays, cycles, prototype keys, unsupported schema, and tape mismatch;
7. fail-closed receive-time restoration when receipt timestamps are missing.

The source and test verification completed with:

| Check | Result |
| --- | --- |
| `npm run build:core` | Passed |
| `npx tsc -p tsconfig.test.json` | Passed |
| Focused Phase 16.1 test | 7 passed, 0 failed |
| `npm test` after implementation | 359 passed, 0 failed |
| `git diff --check` | Passed |

The final full-gate command results from this checkout are recorded below.
Commands that depend on unavailable Playwright-managed browsers or external
physical devices remain explicitly blocked rather than being treated as
passes.

## Offline benchmark

The reproducibility benchmark uses deterministic synthetic tapes with 1,000,
10,000, and 100,000 events; three, three, and two samples respectively; and
64, 198, and 1,998 decisions. It measures tape creation, decision setup,
processing, artifact export, serialization, validation, fresh restoration,
deliberate failed validation, and post-disposal heap delta.

| Events | Artifact | Processing median/p95 ms | Export median/p95 ms | Validation median/p95 ms | Reconstruction median/p95 ms | Failed validation median/p95 ms | Heap delta median/p95 bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 25,094 B | 24.152 / 25.736 | 9.082 / 11.784 | 2.238 / 2.578 | 88.350 / 93.377 | 0.110 / 0.184 | 636,280 / 1,324,840 |
| 10,000 | 75,278 B | 462.560 / 466.345 | 22.736 / 22.960 | 5.060 / 5.966 | 977.980 / 1,001.896 | 0.203 / 0.225 | 5,008,024 / 5,009,072 |
| 100,000 | 759,182 B | 12,064.573 / 12,064.573 | 185.082 / 185.082 | 59.753 / 59.753 | 17,551.162 / 17,551.162 | 1.029 / 1.029 | 48,658,448 / 48,658,448 |

The captured benchmark command output and JSON payload were retained at
`/tmp/openkline-phase16-1-scenario-benchmark-pushed.json` during verification;
the capture includes the npm command preamble before the JSON object. The
checked-in table corresponds to that captured run. A later rerun of the same
command on this checkout also passed; its medians were 23.578 ms
processing and 94.684 ms reconstruction at 1k, 501.609 ms and 1,059.950 ms at
10k, and 12,610.947 ms and 18,835.960 ms at 100k. This confirms reproducible
behavior but also shows normal host variance, so neither run is a universal
throughput claim. The heap values are process-level deltas after local
references were released and forced GC was requested; they do not prove zero
process heap growth. Each workload retained 64 journal entries and evicted the
remaining presentation entries. These schema-1 measurements are not directly
comparable with the Phase 16.0.3 schema-4 observer-dispatch benchmark.

## Final verification matrix

| Command / gate | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | Core and React builds plus both no-emit TypeScript checks |
| `npm test` | PASS | 359 passed, 0 failed, 0 skipped |
| `npm run test:market-replay` | PASS | 17 passed, 0 failed |
| `npm run benchmark:research-scenario` | PASS | Schema-1 1k/10k/100k workloads; fresh rerun also passed |
| `npm run api:inventory` | PASS | 319 runtime exports, 736 type exports; baseline not rewritten |
| `npm run api:diagnostics` | PASS / review required | No removals or findings; additive review reports 3 pre-existing changed declarations |
| `npm run api:check` | OPEN / expected failure | No removals; historical hashes still differ for `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions` |
| `npm run studio:check` | PASS | Core has no React/Next runtime dependency; Studio remains private |
| `npm run package:check` | PASS | Local dry-run pack: 542 files, 664,093 bytes |
| `npm run package:smoke` | PASS | Installed local `openkline-0.1.0.tgz` as an ESM consumer |
| `npm run package:audit` | PASS / license pending | Core and React package audits pass; licensing remains owner/legal gate |
| `npm run package:portability` | PASS | Provider-neutral metadata and worker artifact checks pass |
| `npm run distribution:check` | PASS | 542 files, no problems, local SHA-1 `a59a3bd662c48cb7523e38de3b16aa9629b2a89d` |
| `npm run stress:ci` | PASS | Node and browser stress; 0 orphan failures, 0 worker orphans, 0 remaining canvases |
| `npm run test:browser` | PASS | Chromium 35/35 |
| `npm run test:react:browser` | PASS | React Studio Chromium 38/38 |
| `npm run test:react:production` | PASS | Next.js production Chromium 1/1 |
| `npm run test:browser:compat` | PARTIAL / OPEN | Mobile Chrome 35/35; Firefox 35 blocked, WebKit 35 blocked, Mobile Safari 35 blocked by missing managed executables |

Playwright is `1.64.1`. The cloud checkout has system Chromium at
`/usr/bin/chromium`, but no Playwright-managed Firefox, WebKit, or mobile
Safari executables. The compatibility command therefore produced 35 real
mobile-Chrome passes and 105 launch failures before assertions. No system
Firefox, Safari substitute, TLS bypass, fabricated browser result, or repeated
artifact download attempt was used. Physical-device coverage is not tested.

## Public-surface and security review

The new contracts are exported only from the internal research-execution
module. Root API inventory and diagnostics must continue to compare against the
protected historical baseline; no public API approval is implied by this
implementation. The artifact has no authentication, encryption, signature, or
remote fetch behavior. Consumers must treat files as untrusted input and use
the validator before any restore. Absolute resource limits and disposal on
failure are intended to bound offline denial-of-service exposure, not to make
arbitrary hostile JSON safe in every embedding.

## Acceptance matrix

| Criterion | Status | Evidence / limitation |
| --- | --- | --- |
| Versioned scenario artifact | Implemented / verified | Schema 1 creator, serializer, parser, validator, and round-trip tests |
| Exact tape/source binding | Implemented / verified | Identity, fingerprint, version, ordering, instruments, venue, and source-generation checks |
| Strict resource and shape validation | Implemented / verified | Bounds and hostile-input tests; unauthenticated hash only |
| Deterministic submit/cancel reconstruction | Implemented / verified | Fresh-session replay and decision-order tests |
| Orders/fills/ledger recomputed | Implemented / verified | Imported derived results are not accepted |
| Causality and financial invariants | Implemented / verified | Existing engine rules plus focused parity/correction tests |
| Journal completeness/retention semantics | Implemented / verified | Frontier/history checks and bounded retention metadata |
| Internal benchmark | Implemented / verified | Deterministic 1k/10k/100k schema-1 benchmark |
| Phase 16.1 public boundary unchanged | Verified | No Phase 16.1 root or React export; inventory completed without rewriting the baseline |
| Existing Node/package/distribution checks | Verified | Full Node, package, portability, and distribution commands passed; license approval remains separate |
| Official Firefox/WebKit/mobile browser evidence | Open / environment gated | No managed-browser claim is made here |
| Physical-device, accessibility, legal, release gates | Open | Outside this authorization and environment |
| Phase 16.2 / Studio / worker / broker / live execution | Not authorized / not implemented | Explicitly excluded by owner authorization |

## Remaining gates and handoff

Phase 16.1 internal engineering is ready for owner review after the final
command matrix and documentation commit are pushed. It does not close Phase
15.5 or any browser, device, accessibility, legal, licensing, protected API,
publication, or release gate. The unauthenticated content hash must not be
described as cryptographic authenticity. A future public API decision must be
recorded separately before any root export or consumer-facing documentation is
added.
