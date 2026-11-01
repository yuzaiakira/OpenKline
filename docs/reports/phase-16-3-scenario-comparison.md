# OpenKline Phase 16.3 — Scenario Comparison Verification

Status: **IMPLEMENTED / VERIFIED INTERNALLY — NOT PUBLIC**

This report records the authorized Phase 16.3 internal implementation. It
does not approve public API exposure, release, npm publication, live order
execution, or any claim that a simulated fill occurred on an exchange.

## Scope and authorization

The owner explicitly authorized both the reviewed design documentation and the
internal implementation of scenario comparison and execution-assumption
sensitivity. The implementation is limited to internal source, tests,
benchmarks, and technical documentation.

The following remain excluded: root or React exports, protected API-baseline
changes, Studio integration, Workers, brokers, live execution, licensing,
npm publication, tags, releases, GitHub Actions, and Phase 16.4.

## Repository and Git evidence

| Item | Value |
| --- | --- |
| Starting verified SHA | `40e6d12ac0bb12b7b0da29a1c280b023c419d975` |
| Design commit | `53820951fde0f599ddc28b543d55a4696f048670` |
| Initial implementation commit | `7f35d3b8c7030c0d7e27e48dfa22bb15a73f96c0` |
| Benchmark tooling commit | `29481a02201f06b138ee045456223fc92284dd14` |
| Test-hardening commit | `f1493af159665b144201c5b15f68a73efed0ce87` |
| Final implementation/source SHA | `1cdec710f707767860b950439e0cafd365e28b7c` |
| Branch | `main` |
| Author / committer | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Push policy | Each successful commit was pushed immediately to `origin/main` |

The report and benchmark documentation are documentation-only closure changes
after the source SHA above. The final repository tip, `HEAD == origin/main`,
clean-tree result, and the exact documentation closure commit are verified in
the delivery handoff after the report commit. No force-push or history rewrite
was used.

## Implemented capabilities

- Internal sequential `compareResearchScenarios()` coordinator with one active
  session at a time.
- Maximum eight scenarios including the baseline, maximum 1,000,000 aggregate
  eligible event visits, bounded result records/diagnostics, and an initial
  8 MiB serialized result budget.
- Strict baseline and candidate artifact validation before reconstruction,
  including exact tape ID/fingerprint/version/order, instrument set, venue,
  and source-generation binding.
- Allowlisted candidate patches for commission, slippage, price impact,
  latency, displayed-depth participation, execution policy, risk limits, and
  precision policy. Unknown patch fields are rejected.
- Candidate variants clone assumptions and recompute their ordinary artifact
  integrity hash without mutating the baseline tape, decisions, or artifact.
  Changes that would invalidate durable decision metadata, such as an
  incompatible latency patch, fail closed.
- Fresh causal restoration for baseline and each candidate, with candidate
  error isolation and guaranteed session disposal on success, failure, and
  cancellation.
- Stable assumption, decision-history, decision-action, result-evidence, and
  comparison fingerprints. Candidate order is canonicalized for deterministic
  comparison identity.
- Controlled fixed-history and descriptive different-history classifications;
  no profitability or superiority ranking is performed.
- Null-aware and uncertainty-aware metric deltas. Indeterminate valuation
  leaves valuation-dependent deltas `unknown` with `delta: null`.
- Immutable, bounded, JSON-safe data-only output. No live sessions, complete
  tapes, checkpoint caches, or provider credentials are retained in results.
- Cooperative cancellation at validation and restored event boundaries,
  explicit cancelled status, and no incomplete result presented as verified.
- Checkpoints are disabled by default. Optional candidate-local checkpoints
  retain the existing causal evidence fingerprint contract; operational cache
  metadata does not affect evidence identity.

## Public API boundary

The implementation is intentionally confined to `src/research-execution/`.
The internal module index is not re-exported from `src/index.ts` or the React
package. The package `exports` map continues to expose only the existing root
entry. No protected API baseline file was modified and no public scenario or
comparison format was promised.

The API compatibility check was run and remains **OPEN / FAIL** on inherited
baseline differences: it reported no removals but three changed declaration
hashes for `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions` against
baseline commit `3e7a889a94c40255bbcce210a672856cfc98b32b`. Those differences
were not changed by the Phase 16.3 internal module and require separate owner
review.

## Verification results

| Command | Result |
| --- | --- |
| `npm run build:core` | PASS |
| `npm run typecheck` | PASS |
| Focused comparison tests | **11 passed, 0 failed** |
| `npm test` | **380 passed, 0 failed, 0 skipped** |
| `npm run test:market-replay` | **17 passed, 0 failed** |
| `npm run test:browser` | **35 passed** using configured system `/usr/bin/chromium` |
| `npm run test:react:browser` | **38 passed** using configured system Chromium |
| `npm run package:smoke` | PASS; local tarball installed and ESM consumer loaded |
| `npm run package:check` | PASS; local pack inspection |
| `npm run distribution:check` | PASS; 550 files, 686,718-byte tarball, no problems |
| `npm run studio:check` | PASS; core remains framework-independent |
| `npm run stress:ci` | PASS; node and browser stress profiles |
| `npm run test:browser:compat` | BLOCKED for managed Firefox/WebKit/Mobile Safari; see below |
| `npm run api:check` | OPEN / FAIL on inherited 3 declaration hash changes; no removals |

The full Node suite includes the existing research execution, reference-ledger,
causality, Market Replay, corporate-action, and lifecycle coverage. The
focused Phase 16.3 tests cover baseline isolation, fee sensitivity, different
decision histories, fail-closed latency, incompatible tape identity, budget
preflight, checkpoint-independent evidence, cancellation before and during
restore, unsupported fields, deterministic ordering, and indeterminate
valuation deltas.

The stress result recorded zero orphan failures, zero Worker orphans, zero
remaining canvases, and no page errors. The React browser run emitted existing
illustrative unresolved-source warnings for Studio fixtures; all 38 assertions
passed and no Phase 16.3 source is used by that private consumer.

## Cross-browser and device boundary

Playwright package version is `1.64.1`. The project configuration explicitly
uses `/usr/bin/chromium` for Chromium and mobile-Chrome emulation. Playwright-
managed Firefox and WebKit executables are absent from
`/home/agent/.cache/ms-playwright`:

- Firefox expected path: `firefox-1555/firefox/firefox`
- WebKit expected path: `webkit-2370/pw_run.sh`

The compatibility command produced 35 passing mobile-Chrome-emulation tests
using the same configured system Chromium and 105 launch failures before
assertions: 35 Firefox, 35 WebKit, and 35 Mobile Safari. These are
**BLOCKED**, not passing cross-browser evidence. Physical devices and
accessibility/visual release approval were not claimed.

## Phase 16.3 comparison benchmark

Command:

```text
npm run benchmark:research-comparison
```

Environment: Linux x64, Node `v24.19.0`, forced GC available. Each sample
used one baseline and two sequential assumption-patch candidates, with
checkpoints disabled. The complete protocol is in
`docs/benchmarks/research-scenario-comparison.md`.

| Events | Samples | Comparison median / p95 ms | Tape build median / p95 ms | Artifact build median / p95 ms | Result bytes median / p95 | Retained heap delta median / p95 bytes | Visits |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 3 | 272.271 / 289.417 | 29.668 / 48.681 | 58.909 / 66.013 | 7,827 / 7,827 | 336,320 / 1,021,416 | 3,000 |
| 10,000 | 3 | 2,927.730 / 2,944.946 | 279.082 / 281.640 | 651.594 / 669.865 | 7,855 / 7,855 | 165,432 / 228,832 | 30,000 |
| 100,000 | 2 | 24,113.630 / 24,113.630 | 2,658.565 / 2,658.565 | 5,038.836 / 5,038.836 | 7,883 / 7,883 | 182,200 / 182,200 | 300,000 |

All workloads stayed below the configured 8-scenario, 1,000,000-visit, and
8 MiB result limits. The 100k p95 is the maximum of two samples and is not a
stable tail estimate. No 500k workload was run. The overall benchmark status
is intentionally `partial`: the baseline has expected evidence, while patched
variants deliberately have no source expected result. The candidate
reconstructions themselves are explicit and deterministic; no incomplete
result is labelled `verified`.

These are synthetic Node measurements and must not be compared directly with
Canvas2D FPS, broker throughput, or exchange execution quality.

## Acceptance matrix

| Criterion | State | Evidence / limitation |
| --- | --- | --- |
| Internal comparison engine | **VERIFIED** | Source implementation and 11 focused tests |
| Allowlisted assumption patches | **VERIFIED** | Commission, slippage, price impact, latency, execution/participation, risk, precision; invalid fields rejected |
| Exact tape/source binding | **VERIFIED** | Restore compatibility checks and incompatible-candidate test |
| Independent causal reconstruction | **VERIFIED** | Fresh sessions, bounded visit accounting, full Node/replay tests |
| Baseline immutability | **VERIFIED** | Baseline JSON unchanged after comparison |
| Financial and causal invariants | **VERIFIED internally** | Full research/reference-ledger and replay suites; no public execution claim |
| Null/indeterminate handling | **VERIFIED** | Unknown delta status and null delta for stale valuation |
| Different decision histories | **VERIFIED** | Descriptive classification, no ranking |
| Cancellation and disposal | **VERIFIED internally** | Pre-restore and mid-restore cancellation tests; stress cleanup |
| Resource budgets | **VERIFIED** | Scenario, event-visit, record/diagnostic, and serialized-result limits tested |
| Checkpoint policy | **VERIFIED** | Disabled default and evidence parity test |
| Deterministic output | **VERIFIED** | Repeated plans and candidate-order canonicalization |
| 1k/10k/100k benchmark | **VERIFIED** | Actual run at benchmark commit; 500k not tested |
| Public API compatibility | **OPEN** | Inherited 3 declaration hash changes; no removals; owner review required |
| Chromium | **VERIFIED locally** | 35 tests with system Chromium, not managed cross-browser evidence |
| Firefox/WebKit/Mobile Safari | **BLOCKED** | Playwright-managed executables absent before assertions |
| Physical devices | **NOT TESTED** | No device lab in this environment |
| Accessibility/visual release gate | **OPEN** | Existing local checks are not formal release approval |
| Licensing/release/publication | **NOT AUTHORIZED** | No license, npm, tag, release, or GitHub Actions changes |
| Phase 16.4 | **NOT STARTED** | Separate authorization required |

## Remaining technical debt and gates

1. The protected API declaration baseline still needs owner review for the
   three inherited changed hashes. Phase 16.3 did not modify that baseline.
2. Official Firefox, WebKit, and Mobile Safari verification requires a trusted
   environment containing the matching Playwright-managed artifacts. The
   system Chromium result must not be substituted for those engines.
3. Physical-device, formal accessibility, visual approval, legal, licensing,
   and release gates remain open.
4. The comparison engine is intentionally synchronous and sequential. Worker
   orchestration, parallel comparison, Studio integration, and public export
   are outside the authorization.
5. The 500k benchmark is not verified. Heap measurements are process-level
   observations, not memory guarantees.

## Phase 16.3 readiness decision

The authorized internal Phase 16.3 implementation is complete and verified
within its scope. The internal milestone may close for source/tests/benchmark
purposes, but the repository is **not release-ready** and no Phase 16.4 work
may begin under this authorization. The open API, managed-browser, device,
accessibility, legal, and release gates remain explicitly open.
