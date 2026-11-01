# OpenKline Phase 16.3.1 — Financial Comparability Verification

Status: **IMPLEMENTED / VERIFIED INTERNALLY — NOT PUBLIC**

This report records the explicitly authorized corrective maintenance for the
Phase 16.3 cross-currency monetary-delta defect. It does not authorize Phase
16.4, an FX engine, public API changes, live execution, publication, or
release approval.

## Authorization and repository state

The owner explicitly authorized Phase 16.3.1 corrective maintenance for the
independently reproduced USD/EUR defect, including the smallest source fix,
regression tests, verification, benchmarks, internal documentation, and direct
pushes to `origin/main`.

| Item | Value |
| --- | --- |
| Authorized starting SHA | `b48e044b297a1ad2a1f25adf6bab50b6c3f79d35` |
| Corrective implementation SHA | `e871213cba57e3759914ff36c9e489fa9c4887e6` |
| Branch | `main` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Push | `e871213` pushed directly to `origin/main` |
| Public API / license / release changes | None |

The final documentation closure commit is created after this report and is
verified in the delivery handoff. No force-push, tag, release, npm
publication, or GitHub Actions change is performed.

## Before-fix reproduction

At the authorized baseline, two valid schema-1 artifacts were constructed with:

- identical tape ID/fingerprint (`d19ced98711234bf`) and source generation;
- identical scenario ID, durable decisions, and causal frontier;
- baseline currency `USD`, candidate currency `EUR`;
- no FX conversion.

Before the fix, the comparator returned `identical-decision-history` and
`verified`, while reporting monetary deltas as `available` with numeric zero
deltas for realized P&L, fees, equity, and drawdown. This was a financial
unit-comparability defect, not a reconstruction defect.

## Root cause and fix

`createDifferences()` previously checked only null values and valuation state.
It subtracted numeric metrics without comparing the scenarios' validated
accounting currencies. Equal numeric values therefore appeared comparable
even when one represented USD and the other EUR.

The smallest fix keeps scenario reconstruction independent and adds a
currency gate to the comparison layer:

- `monetaryUnits` preserves baseline/candidate currency provenance and whether
  the units are comparable.
- Realized P&L, unrealized P&L, equity, market value, drawdown, total fees, and
  modeled monetary execution fees return `status: "not-comparable"` and
  `delta: null` when currencies differ without an approved FX conversion.
- The deterministic reason is:
  `Accounting currency mismatch: baseline USD, candidate EUR; no FX conversion is configured`.
- Original baseline and candidate values remain present.
- Same-currency deltas remain `available` and numeric.
- Valuation uncertainty is evaluated after currency compatibility. Thus a
  currency mismatch takes precedence over an indeterminate valuation.
- Drawdown percentages remain dimensionless but become `unknown` when their
  valuation basis is incomplete; they are not silently treated as monetary.
- Counts and quantities remain independently comparable when their units are
  compatible.
- `initialCapital` is exposed in each scenario's metrics for explicit review;
  no implicit normalization or ranking is introduced.

No FX conversion, artifact schema change, hash change, tape contract change,
decision mutation, reference-ledger change, or public export was added.

## After-fix evidence

The exact USD/EUR fixture now returns:

```json
{
  "compatibility": "identical-decision-history",
  "status": "verified",
  "monetaryUnits": {
    "baselineCurrency": "USD",
    "candidateCurrency": "EUR",
    "comparable": false
  },
  "equity": {
    "status": "not-comparable",
    "baseline": 999,
    "candidate": 999,
    "delta": null,
    "reason": "Accounting currency mismatch: baseline USD, candidate EUR; no FX conversion is configured"
  }
}
```

The causal reconstruction remains `verified`; only the monetary comparison is
not-comparable. This separation is intentional.

## Regression coverage

The focused comparison suite contains **16 passing tests** and covers:

- exact USD/EUR reproduction, equal and nonzero monetary values;
- valid same-currency monetary deltas;
- different initial capital and precision policies;
- nonmonetary fill/order/quantity comparisons;
- partial and indeterminate valuation, including currency-mismatch precedence;
- different decision histories and descriptive-only classification;
- deterministic fingerprints and candidate-order canonicalization;
- baseline immutability and no live session in output;
- cancellation, disposal, aggregate event budget, and result-size budget;
- incompatible tape identity, checkpoint-independent evidence, and rejected
  assumption fields.

## Verification matrix

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| Focused comparison suite | **16 passed, 0 failed** |
| `npm test` | **385 passed, 0 failed, 0 skipped** |
| `npm run test:market-replay` | **17 passed, 0 failed** |
| `npm run test:browser` | **35 passed** with configured system `/usr/bin/chromium` |
| `npm run test:react:browser` | **38 passed** with configured system Chromium |
| `npm run api:inventory` | PASS; 319 runtime exports, 736 type exports, baseline not written |
| `npm run api:diagnostics` | PASS; no removals/changed declarations found by diagnostics |
| `npm run api:check` | **OPEN / FAIL**; inherited three changed hashes, no removals |
| `npm run package:smoke` | PASS; local tarball installed and ESM consumer loaded |
| `npm run package:check` | PASS |
| `npm run distribution:check` | PASS; 550 files, 687,471-byte tarball, no problems |
| `npm run studio:check` | PASS; core remains framework-independent |
| `npm run stress:ci` | PASS; zero orphan failures, zero Worker orphans, zero remaining canvases |

The API compatibility failure remains the inherited baseline difference for
`Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions` against baseline
commit `3e7a889a94c40255bbcce210a672856cfc98b32b`. It was not marked passing
and the protected baseline was not modified.

## Comparison benchmark

Command:

```text
npm run benchmark:research-comparison
```

The run was performed at `e871213cba57e3759914ff36c9e489fa9c4887e6` on Linux
x64 with Node `v24.19.0`, forced GC available, checkpoints disabled, three
sequential scenarios, an 8 MiB result limit, and a 1,000,000 eligible-event
budget.

| Events | Samples | Comparison median / p95 ms | Result bytes median / p95 | Retained heap delta median / p95 bytes | Visits |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 3 | 264.993 / 297.623 | 8,860 / 8,860 | 314,304 / 1,023,664 | 3,000 |
| 10,000 | 3 | 3,037.272 / 3,097.623 | 8,888 / 8,888 | 156,392 / 221,440 | 30,000 |
| 100,000 | 2 | 24,968.951 / 24,968.951 | 8,916 / 8,916 | 240,064 / 240,064 | 300,000 |

The result-size increase from Phase 16.3 is bounded and attributable to
currency provenance, market-value, and modeled monetary fee delta fields. The
100k p95 is the maximum of two samples and is not a stable tail estimate. The
500k workload remains **NOT VERIFIED**. These are synthetic Node measurements,
not broker throughput, exchange fill quality, or chart FPS claims.

## Browser and governance gates

The Chromium and React runs use the repository's configured system Chromium;
they do not establish managed Firefox, WebKit, Mobile Safari, or physical-
device compatibility. Those gates remain separate and open. No Phase 16.3.1
code is exported from the root or React package. Licensing, accessibility,
legal, public API approval, npm publication, tags, releases, live execution,
and Phase 16.4 remain outside this authorization.

## Acceptance decision

The authorized Phase 16.3.1 corrective maintenance is complete and verified
internally. Cross-currency monetary deltas can no longer silently mix USD/EUR
numeric values; valid same-currency semantics and causal reconstruction remain
intact. The internal corrective gate may close, while all inherited public API,
browser/device, legal, accessibility, and release gates remain open.
