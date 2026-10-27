# Phase 8.8.13 — Trusted Final-Seven Browser Verification

Local Manjaro trusted-machine focused rerun against source `5062735097301ce22dd50f1f78f7f84cf96394e1` (behavioral `6e4dd92fd08dc50c23fead4f9c3c69b311aeddf5`; intervening commit docs-only).

## Verdict

**FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN**

**NOT RELEASE READY**

| Group | Focus | Records | Passed | Failed |
| --- | --- | ---: | ---: | ---: |
| F1 | studio-firefox drawing trio | 3 | 0 | 3 |
| F2 | studio-webkit paper + alert | 2 | 1 | 1 |
| F3 | studio-mobile-safari paper + alert | 2 | 0 | 2 |
| **Total** | | **7** | **1** | **6** |

## Environment

- Host: Manjaro Linux (local Docker; not ChatGPT Cloud)
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Playwright: `1.64.1`
- Browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2

## Seven targeted results

1. **FAIL** firefox · snaps drawing — tool active, `Drawings (0)`
2. **FAIL** firefox · workspace reload drawing — same
3. **FAIL** firefox · replay restore drawing — same
4. **PASS** webkit · paper trading
5. **FAIL** mobile-safari · paper trading — notice `Order exceeds the configured maximum notional`
6. **FAIL** webkit · local alert — `Alerts (1)` created as `Close crosses threshold` despite fill(`Studio close alert`)
7. **FAIL** mobile-safari · local alert — same name-fill failure

## Actionable findings for Cloud Agent

1. Firefox drawing still does not register anchors after managed mouse placement despite Phase 8.8.12 sync helper; CSS/backing sizes look matched in diagnostics.
2. Mobile Safari paper: quantity fill / notional risk path — order rejected before pending.
3. WebKit/Safari alert: Playwright `fill` on Alert name does not change the controlled value used at create; default name is persisted and remove control is `Remove Close crosses threshold`.

## Local archive

- `openkline-phase-8-8-13-studio-focused-diag-20261027T155411Z.tar.gz` — `5da3924bf93794cfe641dff4854c32de8b43f6a7240c99e449922f5467c5721c`

Prior Phase 8.8.11 archives preserved unchanged.
