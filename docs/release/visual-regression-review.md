# Visual regression review status

Status: **Review artifacts prepared; approved baseline gate open**

`tests/react-browser/visual-regression-review.spec.ts` captures deterministic
review artifacts for:

- Studio dark theme at 1280×900
- Studio light theme at 1280×900
- narrow Studio layout at 390×844

The test controls viewport and waits for the chart canvas before capturing
non-empty PNGs. Playwright stores the artifacts below the test result output so
they can be reviewed without adding binary baselines to the source tree.

No baseline is auto-approved by this test. The project still needs owner/team
review of representative screenshots, approved baseline storage, and the
required managed browser engines before a visual-regression gate can be marked
PASS. Canvas rendering can vary by browser/font/OS, so a baseline must record
engine, viewport, device scale, locale, timezone, fonts, and fixture data.

Each capture also writes an `image-difference.json` report. Without
`OPENKLINE_VISUAL_BASELINE_DIR`, its status is `SCREENSHOT GENERATED`. When a
matching baseline file is supplied, the test performs strict byte comparison
and records `SCREENSHOT COMPARED` or `REGRESSION DETECTED`; a missing baseline
is reported as `UNABLE TO VERIFY`. The comparison never writes or approves a
baseline and its byte-difference count is only a review signal, not a pixel,
WCAG, or cross-browser compatibility claim.

## Phase 8.6.2 determinism controls

The review test now records and fixes the major environment inputs that can
change a candidate:

| Input | Controlled value |
| --- | --- |
| Locale | `en-US` |
| Time zone | `UTC` |
| Device scale factor | `1` |
| Reduced motion | `reduce` |
| Animation capture | Playwright screenshot animations disabled |
| Desktop viewport | `1280×900` |
| Narrow viewport | `390×844` |
| Fixture | Private Next.js Studio deterministic demo |

Each difference report also records the Playwright project, resolved browser
version, and viewport. Font availability and Canvas rasterization remain
machine/engine properties and must be held constant by the reviewer when
approving a baseline. The current targeted Chromium run generated candidates
with status `SCREENSHOT GENERATED`; no baseline was approved.

## Phase 8.7 fixture audit

The audit found that the Studio demo quote provider derives displayed quote
values from `Date.now()`. Candle data was deterministic, but quote labels could
therefore change between captures. The review harness now installs a fixed
clock before the Next.js application loads. This keeps runtime quote behavior
unchanged while making the review fixture reproducible. Repeated local
Chromium captures produced identical candidate hashes; the status remains
`SCREENSHOT GENERATED` and no baseline was approved.

Latest local candidates (Chromium `154.0.8037.57`, no baseline) are:

| Candidate | Viewport | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `studio-dark.png` | 1280×900 | 477,760 | `8e90174eaf37fd5d165f43af4f19ade77e4b01df998a9de7dafa2609e87a0f92` |
| `studio-light.png` | 1280×900 | 477,136 | `e34a3a6e96c150821a06e63c39ee8beb5cf0603a9dd7cdbb38762d4aa8f12712` |
| `studio-mobile.png` | 390×844 | 481,421 | `39b272cca9c03005292c6a4aa6df6c297c2df7ebf1823b44f69d0e528a9797cf` |

These are ignored local review artifacts, not approved repository baselines.
The current Phase 8.7 source has not been rerun in the trusted managed
Firefox, WebKit, or mobile projects.

## Phase 8.8 readiness waits

The review harness now waits for the actual dark/light Canvas background pixel,
the chart's dynamic visible-bar `aria-label`, deterministic demo quote state,
and two animation frames before capture. These condition-based waits address
observed initial-render and theme-repaint races without fixed sleeps or
baseline relaxation. Two consecutive local runs produced identical hashes
for all three candidates after the change. No baseline was approved.

## Review procedure

```bash
npm run test:react:browser -- --grep "review artifact"
```

Inspect the generated PNGs and any diffs manually. Do not update baselines just
to make a failing visual test green. Firefox/WebKit/Mobile Safari visual
artifacts remain blocked with the managed browser gate.

To compare against an owner-approved local review set, provide its directory
without copying it into the repository:

```bash
OPENKLINE_VISUAL_BASELINE_DIR=/trusted/review/baselines \
  npm run test:react:browser -- --grep "review artifact"
```
