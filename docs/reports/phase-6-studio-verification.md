# OpenKline Phase 6 Studio verification

Verification date: 2026-10-25 (Asia/Tehran)

Status: **Implemented locally; broader Phase 6 acceptance remains open.**

## Implemented Studio capabilities

- Private Next.js App Router Studio at the existing example root, consuming
  only `openkline` and `@openkline/react` public APIs.
- Symbol/timeframe fixture control; Candles, Line, and Area presentation;
  fit/reset and pan/zoom controls; crosshair readout; theme, locale, timezone,
  precision, and interaction settings.
- Built-in indicator selection and removal, dynamic removable overlay series,
  object tree visibility/color controls, and a stable public `getSeriesInfo` /
  `setSeriesStyle` API for restored workspaces.
- Built-in drawing activation, selection, visibility, color, locking, removal,
  and undo/redo through the existing drawing engine.
- Workspace browser-local Save/Load, JSON Export, and restricted KlineScript
  compile/add workflow with diagnostics.
- Responsive layout, keyboard-visible controls, labelled inputs, pressed
  states, live status announcements, and a touch-sized viewport workflow.

## Local verification

`npm run test:react:browser` runs the original Strict Mode adapter lifecycle
test plus two Studio workflows in local system Chromium:

1. chart presentation, Bollinger Bands, removable overlay, drawing/lock,
   local Save/Load, KlineScript compilation, runtime theme, and symbol change;
2. 390×844 touch-sized responsive layout and chart-presentation operation.

Completed local commands:

- `npm run typecheck`: passed.
- `npm test`: passed, 54 Node unit/integration tests.
- `npm run test:browser`: passed, three Canvas/KlineScript Chromium tests.
- `npm run test:react:browser`: passed, three local Chromium tests (one React
  lifecycle workflow and two Studio workflows).
- `npm run package:smoke`: passed for a packed root ESM consumer.
- `node scripts/consumer-preview-smoke.mjs`: passed for packed Vanilla ESM and
  TypeScript React consumers.
- `npm run build --prefix examples/nextjs-app-router`: passed.

`npm run benchmark:browser` was repeated after Studio implementation. In local
HeadlessChrome 154, it recorded 62.11 FPS, 16.7 ms median / 16.8 ms p95 frame
interval, 0.347 ms append work, 0.5 ms median / 1.0 ms p95 frame work, and
10.1 ms navigation p95 at 100,000 candles. Heap was 620,310,969 bytes before
destroy and 1,925,370 bytes after destroy, with zero remaining canvases. The
Studio uses a 240-bar fixture and no core rendering optimization was made from
this single local measurement. These figures are reproducible local evidence,
not universal performance promises.

It does not claim Firefox, WebKit, Mobile Safari, external market-data, or
production SaaS verification.

## Git verification

Studio is committed as `f86fcae210ee3cbb140c0f05a223debc5274fdb6`
(`feat(studio): add local chart workspace`) with both author and committer
recorded as `Akira Yuzai <yuzai.akira@gmail.com>`. It was pushed directly to
`origin/work`; a post-push `git fetch origin work` resolved `FETCH_HEAD` to the
same commit. No history rewrite or GitHub Actions workflow was used.

## Open acceptance work

- Final Phase 6 performance/memory comparison and package-consumer rerun.
- Formal managed Firefox, WebKit, and Mobile Safari runs remain blocked by the
  established browser-artifact environment restriction.
- Accessibility audit with assistive technology, visual regression baselines,
  production data-provider integrations, and owner acceptance remain open.
