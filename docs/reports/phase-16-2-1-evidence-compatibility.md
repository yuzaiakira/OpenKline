# Phase 16.2.1 — deterministic scenario evidence compatibility

Status: **INTERNAL CORRECTIVE MAINTENANCE VERIFIED — NOT PUBLIC**

The recorded Phase 16.2 authorization explicitly covers corrective checkpoint
and scenario-evidence maintenance. Work began from synchronized
`origin/main` at `67a1b754d7b920b687d1cb461439fd1cce8b4631` with Git identity
`Akira Yuzai <yuzai.akira@gmail.com>`. No Phase 16.3, public API, Studio,
Worker, broker, licensing, release, publication, tag, or GitHub Actions work is
included.

## Reproduction before the fix

The existing result fingerprint hashed the complete `scenario.diagnostics`.
Phase 16.2 added `diagnostics.checkpoints`, while schema-1 artifacts continued
to omit checkpoint options. Restoration therefore created a default
checkpoint-disabled session and produced different operational cache values.

The deterministic reproduction used a valid tape, an enabled interval-1 cache,
a limit submission and cancellation, sufficient events to retain checkpoints,
and schema-1 expected-result evidence. Before the fix:

- source enabled-session fingerprint: `0a8b49fbde56f86d`;
- restored checkpoint-disabled fingerprint: `bfc2256932ef735d`;
- restoration status: `mismatch`;
- orders, fills, ledger, journal, and causal history were otherwise equal;
- the differing fields were checkpoint `enabled`, interval/budget defaults,
  retained count, estimated bytes, and related operational metadata.

This was a false evidence mismatch caused by including cache state in the
causal result fingerprint.

## Corrective boundary

`fingerprintResearchScenarioResult` now uses an explicit stable projection. The
fingerprint includes:

- scenario, tape, and simulation assumptions;
- durable decisions;
- orders and simulated fills;
- financial ledger;
- causal journal and journal-retention metadata;
- causal frontier;
- diagnostics `quality`, `warnings`, `sourceCoverage`,
  `observedTradeCount`, `observedOrderBookEventCount`, and
  `simulatedFillCount`.

It excludes checkpoint enablement, interval, memory budget, retained count,
estimated bytes, evictions, invalidations, capture/restore timings, and
fallback history. These remain available in runtime diagnostics. The projection
is explicit rather than a broad omit rule so a future operational field cannot
silently become evidence.

The schema-1 artifact version, tape fingerprint, durable decision serialization,
artifact content hash, and UTF-16 FNV-1a 64-bit implementation are unchanged.
No imported orders, fills, balances, or expected results are trusted; restore
still validates, replays, recomputes, and compares evidence. A deliberately
altered financial result remains `mismatch`.

## Compatibility evidence

Focused tests now cover:

- checkpoint-enabled artifact creation and checkpoint-disabled restoration
  returning `verified`;
- one stable result fingerprint across disabled, interval-1, interval-250,
  eviction, and over-budget cache configurations after repeated seeks;
- exact orders, fills, ledger, journal, journal retention, decisions, causal
  diagnostics, and evidence parity across those configurations;
- pre-checkpoint diagnostic-shape evidence producing the same schema-1
  fingerprint;
- existing tampered financial evidence remaining a `mismatch`.

The historical source at
`719e693ad2afedb786bc41557c5e2f47982d5c27` was inspected with `git show`. Its
`ResearchDiagnostics` contained exactly the six causal fields now used by the
projection, and its result fingerprint used the same FNV-1a algorithm over that
diagnostic shape. This establishes backward compatibility without changing the
artifact schema or silently accepting arbitrary mismatches.

The new focused artifact/checkpoint set passes **17/17**. The full Node suite
passes **369/369** after the three evidence-compatibility tests are included in
`npm test`.
The Phase 16.2 performance benchmark is unchanged; its final 100k backward-seek
medians remain:

| Workload | Checkpoints enabled | Disabled |
| --- | ---: | ---: |
| Ordinary | 642.656 ms | 420.714 ms |
| Decision-heavy | 939.633 ms | 694.086 ms |
| Order-book-heavy | 211.155 ms | 367.006 ms |

These measurements demonstrate that checkpoints are not universally faster.
The default remains `enabled: false`; adaptive checkpointing was not added.
Structural checkpoint estimates remain distinct from measured process heap, and
500k remains **NOT VERIFIED**.

## Acceptance and remaining gates

Typecheck, market-replay tests, package checks, distribution checks, Chromium,
React Chromium, production React/Next, and stress cleanup remain passing from
the Phase 16.2 validation. The protected API baseline remains unchanged;
`api:check` continues to require owner review for inherited `Chart`,
`WorkspaceDocument`, and `WorkspaceRestoreOptions` hash differences. Managed
Firefox, WebKit, and Mobile Safari remain blocked when their Playwright
executables are unavailable. Legal, licensing, accessibility, physical-device,
public API, npm publication, and release gates remain open.
