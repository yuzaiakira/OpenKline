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

## Review procedure

```bash
npm run test:react:browser -- --grep "review artifact"
```

Inspect the generated PNGs and any diffs manually. Do not update baselines just
to make a failing visual test green. Firefox/WebKit/Mobile Safari visual
artifacts remain blocked with the managed browser gate.
