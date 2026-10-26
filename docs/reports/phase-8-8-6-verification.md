# Phase 8.8.6 — Studio Root-Cause Isolation and Targeted Repair

Status: **OPEN — NOT RELEASE READY**

Behavioral/test source under verification: `796b930658353b22300955789efc90aa635b3327`.
The documentation commits containing this report do not change the chart or
browser test source after that revision.

## Scope and provenance

Phase 8.8.5 evidence was integrated before this increment. Its sanitized pack
is under [`docs/evidence/browser/phase-8-8-5/`](../evidence/browser/phase-8-8-5/)
and targets `241026e3b1eb3cebd0bbb78dd17daea8028b3203`, not the current source.
The local validator independently reports evidence-integrity PASS for all
versioned packs, including the 8.8.5 pack. That integrity result is separate
from the recorded Studio behavior result.

The trusted 8.8.5 run used Playwright `1.64.1` and the official image
`mcr.microsoft.com/playwright:v1.64.1-noble` with digest
`sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`.
It reported Playwright-managed browser versions Chromium `156.0.8078.4`,
Firefox `157.0`, and WebKit `27.2`.

## Baseline and changes

| Area | Result | Classification |
| --- | --- | --- |
| Standalone 8.8.5 trusted evidence | 70/70 passed | Historical, source `241026e`; not current-source certification |
| Studio 8.8.5 trusted evidence | 79 passed / 31 failed of 110 | Historical failure baseline; not resolved |
| Evidence validator | PASS for 8.6.1, 8.8.1, 8.8.3, 8.8.5 | Integrity/provenance only |
| Local TypeScript test compile | PASS | Current source |
| Local selected focused Chromium tests | 4/4 passed | System Chromium only |
| Local complete Studio Chromium suite | 24/24 passed | System `/usr/bin/chromium`; not managed five-browser evidence |
| Current managed-browser runner in cloud | BLOCKED before discovery | Required Playwright binaries are absent; no fallback used |

The current cloud runner recorded `BLOCKED` for all five projects because the
Playwright-managed executables are absent under `/home/agent/.cache/ms-playwright`.
The build portion completed successfully. No browser result was inferred from
this blocked run.

## Root-cause isolation

The complete falsifiable matrix and all 31 record reconciliations are in
[`phase-8-8-6-root-cause-matrix.md`](phase-8-8-6-root-cause-matrix.md).
The baseline classes are:

| Class | Count | Current conclusion |
| --- | ---: | --- |
| timeout | 14 | Observable symptom only; named-step/geometry evidence required |
| assertion-element-not-found | 8 | Drawing input and async UI paths are separated; only the input-contract repair is evidenced locally |
| timeout-pointer-interception | 2 | Baseline error supports an optimizer/fieldset hit-test hypothesis; trusted geometry rerun pending |
| assertion-element-hidden | 1 | Test contract contradicted intentional narrow-layout inactive-panel hiding; assertion repaired |
| page-error-resizeobserver | 6 | Browser error is observed; callback target/cycle cause remains unconfirmed |

The diagnostic fixture is intentionally bounded and failure-only. It captures
viewport geometry, active panel and panel visibility, critical target hit-tests,
page/console errors, and the last 30 ResizeObserver entries. It does not
suppress errors, collect local storage, or alter production behavior.

## Implemented targeted repairs

1. Added `tests/react-browser/studio-test.ts` as a diagnostic fixture and
   switched the Studio functional specs to use it. Unexpected results attach
   `studio-diagnostics.json`.
2. Updated mobile drawing and replay test input to use touch taps when the
   project reports touch points, while retaining mouse input for desktop.
3. Updated the synchronized-symbol test to select a narrow-layout panel before
   asserting its visibility. This matches the existing intentional CSS behavior
   that inactive panels are hidden below 720px.
4. Added named steps around responsive layout, drawing input, and the focused
   backtest path.

No production chart, resize, paper-trading, alert, screener, optimizer, or
financial-data code was changed in this increment. ResizeObserver and the
remaining asynchronous failures are not claimed fixed without a trusted
reproduction.

## Verification commands and results

Passed locally:

```text
npx tsc --noEmit -p tsconfig.test.json                         PASS
npm test                                                       161/161 PASS
npm run typecheck                                             PASS
npm run studio:check                                          PASS
node --test scripts/browser-evidence-validation.test.mjs       5/5 PASS
npm run evidence:browser:check                                PASS (4 packs)
npx playwright test --config playwright.react.config.ts        24/24 PASS
```

The last browser command uses the repository’s explicitly configured system
Chromium executable. It is useful regression evidence only and does not close
Firefox, WebKit, mobile emulation, managed-browser, physical-device, or
accessibility gates.

The current managed collector was also run:

```text
npm run studio:browser:verify                                  BLOCKED
```

It correctly rejected the absent managed binaries rather than substituting
system Chromium. Its generated timestamped artifacts are ignored local output,
not committed evidence.

## Acceptance matrix

| Criterion | Status | Evidence / remaining action |
| --- | --- | --- |
| Integrate and validate 8.8.5 compact evidence | PASS | Validator and 8.8.5 schema tests; behavior remains 79/31 |
| Reconcile every prior Studio failure | PASS as accounting; OPEN as behavior | 31-row matrix, no failure marked resolved |
| Capture falsifiable geometry/hit-test diagnostics | IMPLEMENTED | Failure-only fixture; trusted failure attachments still required |
| Repair mobile drawing input contract | IMPLEMENTED LOCALLY | 24/24 local Studio pass; trusted mobile rerun required |
| Align hidden-panel assertion with responsive contract | IMPLEMENTED LOCALLY | Local pass; trusted mobile rerun required |
| Resolve pointer interception | OPEN | Trusted F1/F2 geometry and full rerun required |
| Resolve ResizeObserver errors | OPEN | Trusted WebKit/Safari F5 required; no speculative suppression |
| Resolve paper/alert/screener/optimization/replay async failures | OPEN | Trusted F6 and full matrix required |
| Current-source five-browser Studio matrix | NOT VERIFIED | Cloud runner blocked; trusted handoff required |
| Physical Android/iOS | NOT TESTED | Separate physical-device review |
| Formal accessibility/visual approval | OPEN | Outside this diagnostic increment |
| Release readiness | NO | Owner/legal/release gates remain open |

## Next action and release boundary

Run the focused handoff in
[`phase-8-8-6-targeted-browser-handoff.md`](phase-8-8-6-targeted-browser-handoff.md)
on the trusted Manjaro machine, then rerun the complete Studio matrix against
the current source. Preserve all diagnostics and archive hashes. Do not
rewrite the historical 8.8.5 evidence or claim that a local Chromium pass is
cross-browser evidence.

Phase 8.8.6 remains open. Phase 3/next-phase work must not be treated as
authorized by this report, and this report does not authorize npm publication,
release tags, GitHub releases, or license changes.
