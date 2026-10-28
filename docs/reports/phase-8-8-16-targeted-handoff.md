# OpenKline Phase 8.8.16 Trusted Browser Targeted Handoff

This document is an execution handoff for the trusted Manjaro host. It is not a
browser result. Use only the official Playwright-managed browsers.

## Source and environment

- Remediation source (product): `4c0861f6dc6b6a16f005ef36688b6bf853139dd1`
- Evidence integration: `4b228d9013843dd1b939de18ea69ca4ad6686d50`
- Docs tip on `origin/work` after Phase 8.8.16: `07a78866b714f647b1e67babae2462d598635dd5` (must contain the product SHA above)
- Previous trusted source: `3e7a889a94c40255bbcce210a672856cfc98b32b`
- Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Required digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Managed browser path: `/ms-playwright`

## Phase A — Seven prior Studio failures first

### Mobile Chrome drawing trio — project `studio-mobile-chrome`

1. `Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes`
2. `Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload`
3. `Studio exposes deterministic replay playback controls and restores the workspace`

### Mobile Safari drawing trio — project `studio-mobile-safari`

1. `Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes`
2. `Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload`
3. `Studio exposes deterministic replay playback controls and restores the workspace`

### Mobile Safari dialog focus — project `studio-mobile-safari`

1. `Studio dialogs keep keyboard focus inside the modal`

Verify for drawings:

- Placement uses main-pane fractions from `data-openkline-main-pane`
- Touchscreen input is used when the Playwright project has `hasTouch`
- Two anchors are accepted and `Drawings (1)` appears
- Reload and replay paths preserve the drawing

Verify for the dialog:

- Rename opens `role=dialog` named `Rename watchlist`
- `Dialog value` exists and receives initial focus
- Tab / Shift+Tab stay inside the modal

## Phase A — Positive controls

Preserve verified Phase 8.8.15 improvements. Exact titles:

| Project | Title |
| --- | --- |
| `studio-firefox` | `Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes` |
| `studio-firefox` | `Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload` |
| `studio-firefox` | `Studio exposes deterministic replay playback controls and restores the workspace` |
| `studio-webkit` | `Studio creates, pauses, persists, and removes a local alert` |
| `studio-mobile-safari` | `Studio creates, pauses, persists, and removes a local alert` |
| `studio-webkit` | `Studio paper trading is visibly simulated, fills causally, and stays chart-scoped` |
| `studio-mobile-safari` | `Studio paper trading is visibly simulated, fills causally, and stays chart-scoped` |

## Full-matrix decision

If all seven previously failing identities PASS and the positive controls do not
regress, execute independently:

1. `npm run browser:verify`
2. `npm run studio:browser:verify`

If any targeted failure remains, preserve diagnostics and report:

`FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN`

Do not claim complete Studio compatibility from targeted results alone.

## Artifact and GitHub rules

- Keep raw Playwright archives on the trusted machine only
- Publish only sanitized text under a new `qa/phase-8-8-17-browser-evidence` branch
- Do not modify product source on Manjaro
- Do not push to `work` from the trusted verification clone
- Confirm `origin/work` remains unchanged after evidence publication
