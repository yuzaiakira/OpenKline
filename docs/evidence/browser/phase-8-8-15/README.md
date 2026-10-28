# Phase 8.8.15 — Trusted Final-Six Browser Verification

Local Manjaro trusted-machine verification against source `3e7a889a94c40255bbcce210a672856cfc98b32b` (behavioral `8f845f6c0370d43744294f4c22301666d8257766`; intervening two commits documentation-only).

## Verdict

**TARGETED SEVEN: 7/7 PASS**

**STANDALONE FULL MATRIX: PASS — 75/75**

**STUDIO FULL MATRIX: FAIL — 118 expected, 7 unexpected (discovered 125)**

**NOT RELEASE READY**

| Group | Focus | Records | Passed | Failed |
| --- | --- | ---: | ---: | ---: |
| A1 | studio-firefox drawing trio | 3 | 3 | 0 |
| A2 | studio-webkit alert | 1 | 1 | 0 |
| A3 | studio-mobile-safari alert | 1 | 1 | 0 |
| A4 | studio-mobile-safari paper | 1 | 1 | 0 |
| A5 | studio-webkit paper positive control | 1 | 1 | 0 |
| **Targeted total** | | **7** | **7** | **0** |

## Environment

- Host: Manjaro Linux (local Docker; not ChatGPT Cloud)
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Playwright: `1.64.1`
- Browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2

## Regression vs Phase 8.8.13

All six previously failing identities now PASS. The WebKit paper positive control remains PASS.

## Full Studio remaining failures (new relative to targeted set)

1. studio-mobile-safari — Studio dialogs keep keyboard focus inside the modal
2. studio-mobile-chrome — snaps drawing anchors…
3. studio-mobile-safari — snaps drawing anchors…
4. studio-mobile-chrome — workspace reload drawing
5. studio-mobile-chrome — replay restore drawing
6. studio-mobile-safari — workspace reload drawing
7. studio-mobile-safari — replay restore drawing

Mobile drawing failures still show `Drawings (0)` after placement. Desktop Firefox drawing is resolved.

## Local archives (trusted machine only)

- `openkline-phase-8-8-15-studio-focused-diag-20261027T173146Z.tar.gz` — `40af795e71d35bbfe368fd994b86366c57a7323f9ce2be807e1283d222ca31b5`
- `openkline-phase-8-8-15-standalone-20261027T173146Z.tar.gz` — `b2b035c4bd31a3d0c49467a5faeb1827c0570347f800309cf9395778096853d5`
- `openkline-phase-8-8-15-studio-full-20261027T173146Z.tar.gz` — `9db477035dd0e2371b16d5cb848c60ab13db09e028cbb27ebe058d9e585f6466`

Prior Phase 8.8.13 archive SHA unchanged: `5da3924bf93794cfe641dff4854c32de8b43f6a7240c99e449922f5467c5721c`.

## Release gates still open

Physical Android, native iOS Safari, accessibility/keyboard review, owner visual baseline, legal/license notices, and explicit owner release authorization remain separate and open.
