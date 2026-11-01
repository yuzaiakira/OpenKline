# OpenKline Phase 16.4.3 — Developer API & Integration Experience

## Disposition

Phase 16.4.3 internal developer-integration readiness is implemented and
verified in the available local Chromium / Next.js environments. This is an
internal engineering delivery only. Public Widget API adoption, package export,
publication, and release readiness are **not** authorized.

| Item | Value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Starting SHA | `4736db65a7b9ce25bfa895ec1da4922b8a5ea1fa` |
| Branch | `main` |
| Required identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Scope | Phase 16.4.3 Developer API & Integration Experience only |
| Implementation commit | `873ebd2eb6722227b910da059f89fcfb510dd291` |
| Report commit | `b954a7ab6f68f0153e43928c4c9a39ccad8b7e0c` |
| Publication state | No npm publication, Git tag, GitHub release, or license change |

## Explicit authorized scope

Internal Widget API hardening, Vanilla/React/Next.js fixtures, Datafeed/Storage
examples, Composition hostile-input hardening, CSP stylesheet contract,
focused tests, benchmarks, documentation, Conventional Commits, and push to
`origin/main`. Public exports, baseline adoption, and Phase 16.4.4+ remain
unauthorized.

## Implemented internal functionality

1. **Developer API consistency** — ownership docs on `InternalWidget`;
   `getFeatures()`, `cancelDrawing()`, deferred `ready` / `layout` /
   `activeChart` / `destroyed` events; `validateWidgetOptions()`.
2. **Configuration** — stricter construction validation (layout, chart type,
   datafeed+query pairing, storage shape, sync booleans); `styles.mode` /
   `styles.nonce`.
3. **Composition security** — reject own accessor properties without invoking
   getters; catch Proxy/hostile inspection throws; preserve DAG sharing and
   JSON-derived documents.
4. **CSP contract** — `styles: { mode: "external" }` skips inline injection;
   export `WIDGET_CSS` / `STYLE_MARKER` for host-managed stylesheets.
5. **Fixtures** — Vanilla integration + CSP pages; Next.js `/widget-integration`
   Strict Mode client bridge via internal alias `openkline/widget-internal`.

## Verified consumer integrations

| Fixture | Evidence |
| --- | --- |
| Vanilla offline Widget | `examples/vanilla/widget-integration.html` + Chromium test |
| Host memory Storage + Datafeed | Chromium developer-integration test |
| CSP external CSS | `examples/vanilla/widget-csp.html` + Chromium test |
| Next.js client-only | `/widget-integration` + React browser test |
| Composition accessors/Proxies | Node `widget-composition-integrity` tests |

## Proposed but not public API contracts

See `docs/guides/widget-developer-integration.md` and the matrix below.
`@openkline/widget`, root exports, published React Widget adapters, and package
CSS entries are proposals only.

### Future Developer API review matrix

| Topic | Proposal | Status |
| --- | --- | --- |
| Package name | `@openkline/widget` | NOT AUTHORIZED |
| Factory | `createOpenKlineWidget(options)` | Internal only |
| Ownership | Widget-owned Charts; borrowed accessors | Documented internally |
| Errors | `WidgetLifecycleError` / composition validation | Internal |
| Async / cancel | AbortSignal + generation pending diagnostics | Inherited 16.4.2.1 |
| Events | ready/state/error/layout/activeChart/chart/destroyed | Internal |
| CSS assets | External stylesheet / nonce / optional Shadow DOM | Prototype + docs |
| React optionality | Optional bridge; Core free of React/Next | Fixture only |
| Compatibility | No root export change this phase | Verified |

## Composition hostile-input investigation

| Case | Result |
| --- | --- |
| Own getters/setters | Rejected without invoking getters |
| Proxy get traps | Caught; validation error (no complete Proxy immunity claimed) |
| Cycles | Rejected (path-based) |
| Shared DAG refs | Allowed |
| Non-plain prototypes | Rejected |
| Non-finite comparison numerics | Rejected |
| Canonical IDs | Enforced |

## Accessibility flake

Studio `Rename watchlist` dialog test under default parallel workers could race
before the Rename control mounts. Test now waits for visibility. Serial and
default parallel runs must both be reported from verification.

## Tests and verification matrix

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — **393/393** |
| `npm run test:browser` | PASS — **49 passed**, **2 skipped** |
| `npx playwright … --workers=1` (React) | PASS — **39/39** (includes Widget Next.js fixture) |
| `npm run test:react:production` | PASS — **1/1** |
| Focused developer integration Chromium | PASS — 3/3 |
| Composition integrity Node | PASS — 5/5 |
| `npm run package:smoke` / `package:check` / `distribution:check` / `studio:check` | PASS |
| `npm run api:inventory` | PASS |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED |
| `npm run api:check` | OPEN/FAIL — inherited Chart / WorkspaceDocument / WorkspaceRestoreOptions |
| `npm run stress:ci` | PASS |
| `npm run benchmark:widget` / `browser` / `multi-chart` | PASS |

Studio a11y Rename-dialog flake: mitigated by waiting for Rename control
visibility; passes under focused accessibility suite.

## Performance

HeadlessChrome `156.0.0.0` (Linux x86_64), local only — not universal guarantees.

| Suite | Observation |
| --- | --- |
| Widget 1k / 10k / 100k createMs | 8.2 / 12.6 / 98.3 |
| Widget datafeedTransitionMs | 10.6 / 30.4 / 264.5 |
| Browser loadMs 1k / 10k / 100k | 11.0 / 66.6 / 933.6 |
| Multi-chart dual-100k loadMs | 170.4; remainingOwnedCanvases 0 |
| Destroy cleanup | pending cleared; Widget-owned canvases 0 |

## Open gates

| Gate | Status |
| --- | --- |
| `api:check` Chart / WorkspaceDocument / WorkspaceRestoreOptions | OPEN/FAIL (inherited) |
| Public Widget API | NOT AUTHORIZED |
| Firefox / WebKit / Mobile Safari / devices | OPEN |
| Formal WCAG/AT | OPEN |
| Universal CSP certification | OPEN (external-mode prototype verified) |
| npm publication / releases / license | OPEN |

## Conventional Commit SHAs

| Commit | Role |
| --- | --- |
| `873ebd2eb6722227b910da059f89fcfb510dd291` | Implementation + fixtures/tests |
| `b954a7ab6f68f0153e43928c4c9a39ccad8b7e0c` | Documentation |

## Final status

`PHASE 16.4.3 — DEVELOPER API & INTEGRATION EXPERIENCE COMPLETE / VERIFIED INTERNALLY — PUBLIC WIDGET API NOT YET AUTHORIZED`
