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
