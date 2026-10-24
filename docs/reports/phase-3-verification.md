# OpenKline Phase 3 Verification

Date: 2026-10-24

Implementation increment: `0cb2ba452c63936e2d9fbcf4e9df09d0e18363b7`, followed
by overlay-error reporting and pre-mutation drawing validation hardening.

Branch: `work`

## Executive result

Phase 3 implementation is substantially complete for the scoped Plugin SDK,
customization foundation, and workspace platform. The implementation is
verified locally on Node.js, Chromium 154, Mobile Chrome emulation, the React
SSR/package surface, and a Next.js 15.5.28 production build.

Phase 2 is not closed. Firefox, WebKit, and Mobile Safari remain explicitly
blocked by the environment's inability to obtain the official Playwright
binaries. The project owner's narrow Phase 2 gate exception permits this Phase
3 work; it does not change those acceptance criteria or authorize a stable 1.0
claim.

## Implemented capabilities

- Chart-scoped `PluginRegistry` with API-versioned metadata, semver host and
  dependency checks, duplicate detection, setup rollback, reverse-order
  resource disposal, required-dependent protection, and idempotent handles.
- Public typed plugin capabilities for indicators, drawing tools, controlled
  line/rectangle/text overlays, chart events, commands/shortcuts, and JSON-only
  plugin state.
- Custom indicator and drawing registration reuses the existing
  `IndicatorRegistry` and `DrawingEngine`; no parallel calculation or drawing
  subsystem was introduced.
- Overlay rendering is viewport-aware, clipped, z-ordered, validated, and
  isolated when a plugin render callback fails. Raw Canvas2D and private chart
  model objects are not exposed.
- Typed chart lifecycle/data/viewport/indicator/drawing/tool/theme events,
  normalized shortcut conflict detection, and configurable wheel zoom, pointer
  pan, crosshair, keyboard shortcuts, theme, locale, timezone, precision, and
  RTL time-axis direction.
- Version 1 workspace JSON serialization and restoration for chart
  configuration, panes, user series, indicator instances/output styles,
  drawings, viewport, plugin versions/state, metadata, and missing-extension
  policies. Parsing is persistence-neutral and rejects invalid references,
  ordering, OHLC, drawing, and JSON state.
- React props for trusted plugins and workspace restoration, a working vanilla
  plugin page, and a Next.js Client Component plugin example.
- Local plugin benchmark and documentation/ADR set for lifecycle, trust,
  customization, workspace persistence, and public API consumption.

## Architecture and compatibility decisions

The repository keeps one public package and extends existing contracts instead
of creating a second SDK package. `OpenKlinePlugin` API version `1` is
independent of package version `0.1.0`; plugin versions use the documented
semver subset. Dependencies must be installed before required dependents.
Workspace restoration requires exact installed plugin version matches and can
skip missing plugins/indicators with an explicit result.

The legacy `OpenKlineExtension` contract remains source-compatible. New
integrations should use `OpenKlinePlugin`. The ADR is
`docs/architecture/adr/003-plugin-sdk.md`.

## Public API verification

The package root exports the Chart plugin methods, plugin metadata/context/
handle/state/command/overlay types, plugin registry/errors, workspace types,
`parseWorkspace`, customization types, and the existing indicator/drawing
contracts. The build emits declarations under `dist/src` and no example or
test imports private source modules as a consumer API.

Verified consumer checks:

- `npm run package:check` — passed; packed `openkline@0.1.0` contains the
  generated public ESM and declaration tree.
- `npm run package:smoke` — passed; the packed tarball installed into a clean
  temporary consumer and imported through its ESM entry.
- `npm run build` in `examples/nextjs-app-router` — passed with Next.js
  `15.5.28`, including the typed plugin Client Component.
- React package typecheck and SSR-safe import — passed.

## Test results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript core/React typecheck | Verified | `npm run typecheck` passed |
| Node unit/integration suite | Verified | 33 passing tests, 0 failures |
| Plugin lifecycle/state/shortcut tests | Verified | Included in the 33 tests |
| Workspace validation tests | Verified | Included in the 33 tests |
| Chromium browser behavior | Verified | 2 Playwright tests passed |
| Mobile Chrome emulation | Verified | 2 Playwright tests passed; touch drawing included |
| Plugin custom indicator/drawing/overlay | Verified | Browser plugin test and standalone example passed |
| Workspace round trip and missing extension policy | Verified | Browser assertions passed |
| React actual browser mount/unmount | Not tested | SSR and type/build checks passed; no dedicated React browser harness |
| Next.js production integration | Verified | Next 15.5.28 production build passed |
| Firefox | Blocked | Official Playwright binary unavailable |
| WebKit | Blocked | Official Playwright binary unavailable |
| Mobile Safari emulation | Blocked | Requires the unavailable Playwright WebKit binary |

The compatibility projects remain in `playwright.config.ts` and have not been
removed or converted to skips. The known binary/CDN failure was not retried
unchanged during Phase 3.

## Performance and memory

All existing Canvas2D performance improvements were retained. The latest local
`npm run benchmark:browser` run used Node.js `v24.19.0`, Playwright `1.64.1`,
headless Chromium `154.0.0.0`, Linux, `/usr/bin/chromium`, `--disable-gpu`,
and the existing deterministic fixture:

| Candles | Load ms | Navigation median/p95 ms | Crosshair median/p95 ms | Append/update ms | Frame p50/p95 ms | FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 17.5 | 1.2 / 3.1 | 0.1 / 0.4 | 1.147 | 16.6 / 16.9 | 65.03 |
| 10,000 | 93.6 | 0.9 / 1.3 | 0.1 / 0.2 | 0.589 | 16.7 / 16.9 | 63.13 |
| 100,000 | 1,232.2 | 1.0 / 1.3 | 0.1 / 0.5 | 0.620 | 16.7 / 17.0 | 62.11 |

The same run observed 557.55 MB heap before destruction, 1.77 MB after
destruction/GC opportunity, and zero remaining chart canvases. Heap values are
engine- and allocation-sensitive observations, not leak-proof limits. The
100k result varies from the earlier 0.525 ms / 61.97 FPS run without a code
regression being identified; the current run is the evidence for this report.

The local `npm run benchmark:plugins` microbenchmark used 200 iterations and a
100,000-candle dataset:

| Operation | Median ms | p95 ms |
| --- | ---: | ---: |
| Registry activation/command/disposal | 0.0057 | 0.0260 |
| Indicator initialization path | 28.5573 | 63.4769 |
| JSON workspace parse round trip | 33.8599 | 58.5267 |

This is a Node registry/engine microbenchmark, not a Canvas2D or cross-device
claim. It does not replace browser rendering measurements.

## Security and stability

The supported trust model is trusted JavaScript/TypeScript modules bundled and
reviewed by the application developer. TypeScript types are not a security
sandbox. The SDK does not load remote plugins, evaluate strings, use `eval` or
`new Function`, or claim isolation from malicious code. KlineScript and
untrusted end-user scripts remain future work.

Invalid plugin activation rolls back tracked registrations. Invalid workspace
input is parsed before chart mutation. Overlay commands are bounded and
validated; an overlay callback failure is reported through `console.error` and
produces no overlay for that frame instead of aborting chart rendering. Drawing
tool validation also completes before workspace mutation. Plugin resource
cleanup is chart-scoped and idempotent.

## Acceptance matrix

| Phase 3 criterion | Status | Evidence / limitation |
| --- | --- | --- |
| Public plugin SDK and declarations | Implemented + Verified | Root exports, typecheck, package smoke |
| Registration and metadata validation | Implemented + Verified | Node plugin tests |
| Activation rollback and disposal | Implemented + Verified | Failure/cleanup tests and chart destroy path |
| Dependencies and compatibility policy | Implemented + Verified | Semver/dependency tests |
| Custom indicators through SDK | Implemented + Verified | Browser custom indicator and public example |
| Custom interactive drawing through SDK | Implemented + Verified | Browser custom tool pointer creation and serialization |
| Controlled rendering extension | Implemented + Verified | Pixel assertion for plugin overlay |
| Events, commands, shortcuts | Implemented + Partially verified | Node registration/conflict tests; crosshair browser path; full event matrix remains follow-up |
| Themes and runtime interaction options | Implemented + Verified | Existing theme/pan/zoom/touch browser coverage; RTL scale Node coverage |
| Localization and RTL foundation | Implemented + Partially verified | Intl locale/timezone and RTL coordinate tests; host UI strings remain application-owned |
| Workspace schema/round trip | Implemented + Verified | Node parser and browser restore/missing-extension checks |
| Persistence-neutral integration | Implemented + Verified | JSON API and guide; no backend/storage policy embedded |
| React integration | Implemented + Partially verified | Props, typecheck, SSR; actual browser mount/unmount harness not run |
| Next.js integration | Implemented + Verified | Next 15.5.28 production build |
| Plugin performance regression | Verified | Existing Canvas2D benchmark and plugin microbenchmark |
| Firefox/WebKit/Mobile Safari | Blocked | Environment only; not claimed compatible |

## Known limitations and deferred requirements

- The initial rendering extension is controlled overlays, not arbitrary custom
  series renderer registration. A future series plugin contract needs a
  measured invalidation and security design.
- There is no core toolbar/context-menu framework or configurable tooltip and
  typography token system. Host applications own those UI surfaces.
- Persistence adapters, authentication, encryption, migrations, package
  signature verification, sandboxing, and remote plugin loading are outside
  this phase by design.
- Full event-matrix browser coverage and a dedicated React browser
  mount/unmount harness remain technical debt.
- Firefox, WebKit, and Mobile Safari are mandatory Phase 2 backlog items for a
  stable release unless the owner separately documents a release decision.

## Phase 2 compatibility backlog

| Target | Status | Required follow-up |
| --- | --- | --- |
| Firefox | Blocked | Run the existing Playwright project with official 1.64.1 Firefox binaries from a trusted cache, official pinned Docker image, or approved offline transfer |
| WebKit | Blocked | Run the existing Playwright project with official 1.64.1 WebKit binaries using the same supported paths |
| Mobile Safari | Blocked | Run iPhone 13 emulation after WebKit is available |

The earlier environment attempts recorded an official CDN HTTP `403 Domain
forbidden`, missing Playwright cache entries (`firefox-1555` and
`webkit-2370`), and failed official Docker image pulls with `Forbidden`. No
system Firefox/Safari or unofficial binary substitution was used.

## Phase 4 readiness

KlineScript has not been started. Phase 3 establishes a capability boundary,
JSON workspace validation, and a documented trust distinction that Phase 4
can build on, but it is not a security sandbox for user scripts. Phase 4 is
**not authorized by this report** and should begin only after the owner closes
the current gate/exception decision and approves a separate KlineScript
security and language-runtime design.

## Git and environment verification

- No `.github/workflows` files were introduced.
- Local Git identity was verified as `Akira Yuzai <yuzai.akira@gmail.com>` for
  both author and committer.
- `0cb2ba452c63936e2d9fbcf4e9df09d0e18363b7` was committed with Conventional
  Commit subject `feat(plugin): add extensible sdk and workspace platform`.
- Overlay isolation and pre-mutation drawing validation were subsequently
  committed and pushed as a separate Conventional Commit after the first
  implementation increment.
- `git push origin work` succeeded; `git ls-remote origin refs/heads/work`
  returned the same SHA.
- The onboarding draft was saved with repository HEAD
  `60bd5e357b4914a99c60474340bce3cbdd1c9c50` and requires publication by the
  user through environment settings. Saving the draft does not publish it.

The final report commit can be verified with
`git log -1 -- docs/reports/phase-3-verification.md`.
