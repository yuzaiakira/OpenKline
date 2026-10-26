# Phase 8.5 browser compatibility matrix

Playwright version: `1.64.1`  
Local diagnostic commit: `686602150b25ba51ac39b82b69c6f9b5f6250c68`  
Local Chromium: `154.0.8037.57` at `/usr/bin/chromium`  
Managed artifact policy: exact Playwright-managed binaries only

`verified-local-diagnostic` is not the same status as portable managed-browser
acceptance. The repository's Chromium projects intentionally use the explicit
system executable for local diagnostic evidence. The portable config contains
no such fallback.

| Project | Status | Evidence |
| --- | --- | --- |
| Chromium desktop | PASS (local diagnostic) | 12/12 Vanilla tests passed through `/usr/bin/chromium`. |
| Mobile Chrome / Pixel 7 emulation | PASS (local diagnostic) | 12/12 Vanilla tests passed through Chromium 154 with Pixel 7 emulation. |
| Firefox | BLOCKED | Playwright-managed Firefox 157 build 1555 executable absent. |
| WebKit | BLOCKED | Playwright-managed WebKit 27.2 build 2370 executable absent. |
| Mobile Safari / iPhone 13 emulation | BLOCKED | Requires unavailable managed WebKit build 2370. |
| Physical Android/iOS | NOT TESTED | No physical-device or device-lab evidence. |

## Executed commands

```bash
npm run browser:diagnostic
npm run browser:verify
```

The diagnostic returned 24 expected tests, 0 unexpected, and status
`verified-local-diagnostic`. The portable runner returned
`blocked-missing-official-browser` with all five managed executable paths
missing; it did not substitute system Firefox, Safari, or WebKit.

The official pinned container was also attempted once:

```bash
docker pull mcr.microsoft.com/playwright:v1.64.1-noble
```

Both the sandboxed and approved-network attempts ended with Docker registry
`Forbidden` while downloading the image configuration. No arbitrary image or
binary was used. A trusted machine must follow
[`browser-verification.md`](./browser-verification.md), preserve the generated
`summary.json` and test artifacts, and transfer those review materials back to
the repository before any managed-browser gate is marked PASS.

## Behavioral scope

The available suite exercises chart rendering, candle/OHLC/line/area/volume
series, indicators, panes, Bollinger fills, pan/zoom, crosshair, drawings,
pointer/touch interactions, themes, resize, replay, alerts, Datafeed cleanup,
Workers, Screener fixtures, and chart destruction. A passing launch is not
treated as sufficient behavior evidence. Accessibility, visual regression, and
physical-device gates are tracked separately.
