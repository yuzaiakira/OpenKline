# Testing

The project uses local checks and does not use GitHub Actions.

For a manual browser preview, run `npm run dev` and open the vanilla example at
`http://127.0.0.1:4173/examples/vanilla/index.html`.

The framework-independent KlineScript editor is at
`http://127.0.0.1:4173/examples/vanilla/klinescript.html`. Its browser test
compiles a valid script, displays a source diagnostic for an invalid call,
changes an input, verifies an oscillator pane, and removes the script indicator.

```bash
npm run typecheck
npm test
npm run test:browser
npm run test:react:browser
npm run test:browser:compat
npm run benchmark
npm run benchmark:browser
npm run benchmark:replay
npm run benchmark:alerts
npm run benchmark:plugins
npm run profile:browser
npm run package:audit
npm run package:check
npm run package:smoke
npm run preview:verify
npm run browser:verify
```

The default `npm run test:browser` runs the Chromium project. The compatibility
matrix is exposed as `npm run test:browser:compat` and runs Firefox, WebKit,
mobile Chrome emulation, and mobile Safari emulation. Missing Playwright
binaries are an explicit blocked result, not a skipped or passing test.

`npm run browser:verify` is the portable formal browser workflow. It uses
`playwright.portable.config.ts`, which requires Playwright-managed browser
artifacts and produces JSON/log/test-result evidence below ignored
`artifacts/browser-verification/`. It does not accept a system Firefox or
WebKit substitution. See `docs/release/browser-verification.md` for
installation, project selection, and transfer instructions.

The unit suite runs against the framework-independent data, scale, viewport,
series, and datafeed modules, including pagination, cancellation, reconnect,
invalid data, correction, and disposal. The React test verifies server-safe
import and SSR output. The Playwright suite serves the vanilla example with a
small local Node server and asserts
all four series types, multi-series crosshair values, dynamic add/remove,
canvas creation, non-empty rendering, zoom, pan, theme changes, updates, and
cleanup. Mobile projects additionally exercise a touch tap that creates a
drawing. It is intentionally interaction-focused rather than screenshot-only.

Strategy coverage is in `tests/strategies.test.ts`. It verifies versioned
metadata and registry isolation, defensive historical-prefix contexts,
completed-bar signal timestamps, deterministic IDs, progress callbacks,
cancellation, invalid candles, and disposal. These tests cover signal
generation only; order fills, portfolio accounting, and result metrics are
separate Phase 8 milestones.

Backtest accounting coverage is in `tests/backtesting.test.ts`. Independent
fixtures verify next-bar-open execution, signal/fill timestamp separation,
commission, slippage, long and short P&L, open-vs-closed positions, final-bar
no-fill behavior, reversal policy, validation, cancellation, disposal, metrics,
fingerprints, and JSON/CSV export. Annualized risk ratios are intentionally
not tested or claimed until their calendar and sampling assumptions are
specified.

Worker backtesting coverage is in `tests/backtesting-worker.test.ts`. It
verifies the versioned protocol guards, one-time defensive initialization,
repeat-run reuse, byte-for-byte serialized parity with the synchronous engine,
progress/status updates, cancellation by termination, timeout, recovery,
supersession, invalid input, and disposal. The Next.js Chromium suite adds a
real Worker run over a deterministic 500,000-bar fixture and asserts that
Cancel leaves no partial export/result. This is real Chromium evidence; it is
not a Firefox, WebKit, Mobile Safari, physical-device, or formal accessibility
claim.

Replay browser coverage is in `tests/browser/replay.spec.ts`. It asserts
inclusive future-data masking across series, indicators, workspace exports,
drawings, and crosshair values; source immutability; read-only structural/data
boundaries; deterministic stepping/playback; datafeed suspension and
resubscription; exit restoration; and chart destruction. The KlineScript browser
workflow also verifies replay-visible script output lengths. Studio coverage
exercises the public replay controls, starting point, Beginning/Latest,
timeline, keyboard stepping, scale/presentation changes, restoration, and a
touch-sized viewport.

The replay browser workflow also verifies that strategy markers are filtered to
the inclusive replay cursor and restored after replay exit. Marker rendering
uses the existing overlay path; this does not claim Firefox, WebKit, Mobile
Safari, physical-device, or formal accessibility coverage.

Alert coverage is in `tests/alerts.test.ts` and `tests/browser/alerts.spec.ts`.
It covers strict thresholds and crossings, warm-up/missing values, indicator
and script outputs, horizontal drawings, frequency/cooldown/finality,
correction deduplication, live/replay isolation, serialization, public Chart
events, simulated replay history, seek rebuilds, and cleanup. The Studio
React-browser suite also creates, pauses, saves, and removes an alert. No test
sends an external notification.

`npm run benchmark:browser` measures synchronous Canvas2D rendering work and
requestAnimationFrame update loops for 1,000, 10,000, and 100,000 candles. It
also records median/p95 navigation, crosshair event-path, frame interval and
frame-work samples, engine-specific heap observations, and confirms that chart
destruction removes the canvas. `npm run profile:browser` instruments the
100,000-candle append path to identify renderer, series, indicator, and shared
time-cache costs. `npm run package:smoke` installs the packed
core tarball into a clean temporary consumer and imports its public ESM entry.
`npm run preview:verify` is broader: it creates prerelease staging tarballs,
installs them into clean Vanilla, TypeScript, React SSR, Next.js, and browser
fixtures, and exercises only public package exports.

Plugin tests cover metadata and dependency validation, activation rollback,
resource ownership, state validation, shortcut conflicts, chart-scoped custom
indicators/drawings/overlays, workspace round trips, and missing-extension
policies. The standalone plugin example is served at
`/examples/vanilla/plugin-example.html`; the Next.js example installs a typed
plugin in its Client Component.

KlineScript tests cover source spans, forbidden calls, immutable metadata,
historical indexing, warm-up/missing values, native EMA equivalence, MACD
projections, hlines, input validation, correction recomputation, cancellation,
budgets, malformed-source seeds, invalid financial input, and the playground
lifecycle. The bounded malformed-source seeds are replayable in
`tests/klinescript-fuzz.test.ts`; this is not an unbounded fuzzing service.
`tests/klinescript-incremental.test.ts` covers the verified pointwise append
subset, missing-volume/null behavior, deterministic randomized prefixes,
multiple outputs, correction fallback, and conservative rejection of history,
parameters, assignments, and technical functions.
`tests/klinescript-worker.test.ts` additionally covers the versioned Worker
protocol, serializable compile responses, worker-side sessions, diagnostics,
malformed requests, cancellation, timeout, restart, and disposal using a
deterministic in-process Worker harness. It does not claim that managed
Firefox/WebKit/mobile artifacts are available.
The Chromium KlineScript browser workflow also exercises a real static ESM
Worker through `Chart.addScriptIndicatorAsync`, then verifies alert output,
replay prefix length, removal, chart destruction, and absence of page errors.
The private Next.js Chromium Studio workflow additionally verifies templates,
diagnostic rendering, autocomplete, browser-local save/delete, Worker runtime
status, indicator creation, and page-error cleanup. This is available
Chromium evidence, not formal Firefox/WebKit/Mobile Safari or accessibility
acceptance.

The cloud's local Chromium test config is diagnostic evidence. Do not edit the
portable config to add system browser paths; formal browser claims require the
managed artifacts. A browser test that times out is a failed or blocked test,
never a pass.

`npm run test:react:browser` starts the private Next.js example locally and
uses Chromium to exercise the actual React adapter in Strict Mode. It verifies
equivalent-array reconciliation, declarative drawing persistence, indicator and
plugin lifecycle, workspace restoration without a `candles` prop, option
updates, unmount, and remount. It also executes a Studio workflow covering
presentation, indicator/overlay/drawing object management, workspace Save/Load,
KlineScript, runtime settings, symbol switching, and a touch-sized responsive
viewport. It is local Chromium evidence, not a Firefox, WebKit, Mobile Safari,
or physical-device claim.

## Phase 7.4 Studio domain tests

The Node suite includes validation and isolation tests for the versioned Studio
workspace container, layout cardinality, legacy single-chart migration, and
watchlist CRUD/reordering/favorites. These tests cover the framework-neutral
domain layer; they do not claim browser UI or multi-chart rendering coverage.

`tests/react-browser/multi-chart-studio.spec.ts` exercises the private Next.js
host in local Chromium. It covers four-panel rendering, stable panel selection,
per-panel indicator isolation, symbol and timestamp-sync switches, watchlist
favorite/reorder controls, named workspace save/load, panel removal, and
mobile panel selection. This is Chromium evidence only; it does not close the
inherited Firefox, WebKit, Mobile Safari, accessibility, or physical-device
gates.
