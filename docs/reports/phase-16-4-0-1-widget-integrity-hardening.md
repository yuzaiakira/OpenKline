# OpenKline Phase 16.4.0.1 — Widget Integrity Hardening

## Final disposition

**PHASE 16.4.0.1 — WIDGET INTEGRITY HARDENING COMPLETE / PUBLIC WIDGET API STILL NOT AUTHORIZED**

This report covers the explicitly authorized internal corrective-maintenance
scope only. It does not approve a public Widget API, a package subpath, npm
publication, a release, or Phase 16.4.1.

| Item | Value |
| --- | --- |
| Repository | yuzaiakira/OpenKline |
| Branch | main |
| Authorized baseline | 57ab4ffc5b827a576fb96bba0c3cbb1097242cab |
| Implementation commit | 962883759c1ce3ec0a2394134e15cf48acd66a3e |
| Regression-test commit | 37f67386f83c4dc73fe4f86b2b461aa197e2d3dc |
| Report delivery commit | df20590ae45cb8d5543f6b7ab8fa24b2325a8751 |
| Git identity | Akira Yuzai <yuzai.akira@gmail.com> |
| Publication state | no npm publication, tag, GitHub release, license change, or GitHub Actions change |

The implementation, regression-test, and report delivery commits were each
pushed immediately to origin/main. The final source/test delivery SHA is
37f67386f83c4dc73fe4f86b2b461aa197e2d3dc; the report delivery SHA is recorded
above. A later documentation-only amendment does not alter source behavior.

## Authorization and boundary

The owner authorized investigation, reproduction, confirmed fixes, regression
tests, internal benchmarks, documentation, Conventional Commits, and direct
pushes for Phase 16.4.0.1. The work remained within the existing browser-side,
framework-independent Widget foundation.

No backend, account system, authentication, billing, broker, live execution,
mandatory data provider, React/Next dependency, public Widget export, protected
API-baseline edit, license work, release artifact, or later Widget phase was
implemented.

## Investigation A — data identity integrity

### Reproduction at the authorized baseline

The suspected direct/offline defect was reproduced before the fix with a
Widget constructed from BTC-USD candles and no Datafeed. The diagnostic
observed:

~~~
{
  "before": {"status":"ready","symbol":null,"timeframe":"1h","hasData":true},
  "after": {"status":"ready","symbol":"ETH-USD","timeframe":"1h","hasData":true},
  "error": null,
  "firstCandle": {"time":1767225600000,"open":100,"high":110,"low":90,"close":105,"volume":10}
}
~~~

This was a real correctness defect: the existing candle remained visible while
the controller reported a new symbol. The root cause was that direct
setSymbol()/setTimeframe() mutated the displayed identity without a data
replacement or a confirmed source binding. The original render path also used
that mutable identity for the controls and ready label.

### Final ownership policy

The internal Widget now has separate confirmed and requested identity state:

| Situation | Confirmed identity | Requested identity | Result |
| --- | --- | --- | --- |
| Direct candles without dataIdentity | unavailable (null fields) | unavailable | data is shown without an invented symbol/timeframe |
| Direct candles with dataIdentity | host-confirmed | same | identityStatus: "confirmed" |
| Direct setSymbol()/setTimeframe() while candles exist | unchanged | unchanged | rejected with WidgetLifecycleError; candles are not relabeled |
| Explicit setData(candles, identity) | new host binding | new host binding | data and identity change together |
| Datafeed request in flight | previous confirmed identity | new query | identityStatus: "loading"; no speculative confirmation |
| Datafeed success | new query identity | new query identity | identityStatus: "confirmed" |
| Datafeed failure | previous confirmed identity remains | failed query | status: "error", identityStatus: "failed"; no successful-looking relabel |
| Cancellation or stale response | unchanged | current request only | stale work cannot commit data or identity |
| Workspace import | metadata identity only | metadata identity | active feed/request is invalidated before restoration |

Identity fields are trimmed and empty values are rejected. Replacing existing
data or data whose identity was confirmed requires a non-empty explicit
identity binding. The controller continues to retain valid old data during a
failed Datafeed transition rather than clearing it or assigning it to the
failed request.

The change is internal and additive to src/widget/; it is not a root-package
API adoption. src/index.ts, the React exports, and
docs/audits/public-api-baseline.json were not changed.

## Investigation B — CSS lifecycle and embedding isolation

### Confirmed issue

The former ensureWidgetStyles() helper inserted a marked style element but had
no ownership or release path. Consequently, repeated mount/unmount cycles could
leave the Widget style in the owning document after the final Widget was
destroyed. This was confirmed by source inspection and addressed with a
behavioral lifecycle test.

### Final policy

- A weak per-Document registry shares one Widget style element among all
  instances in that document.
- A reference count keeps the style while any Widget is alive.
- The final destroy removes only a style element created by the Widget.
- A pre-existing matching marked style is treated as host-owned and is never
  removed.
- Every selector is rooted at [data-openkline-widget]; there is no global
  reset and unrelated host controls are not restyled.
- WidgetDiagnostics.styleElementCount makes style lifecycle observable in
  focused tests.
- The registry key is the owning Document, so document lifecycles do not
  share mutable counts.

The focused browser test creates two independent Widgets, destroys one while
the other remains active, destroys the final Widget, and repeats three
mount/unmount cycles. It verifies host-button styling remains outside the
Widget scope and that the Widget style count returns to its baseline.

### CSP and Shadow DOM limitation

The internal foundation still injects a style element. A restrictive CSP that
blocks inline style elements may prevent these rules from applying. This phase
does not add a nonce contract, external stylesheet distribution, or mandatory
stylesheet service. CSP nonce/asset policy and Shadow DOM integration require a
separate public API and packaging decision. No universal CSP compatibility
claim is made.

## Implemented changes

- Added WidgetDataIdentity and WidgetIdentityStatus to the internal Widget
  contract.
- Preserved confirmed identity separately from requested Datafeed state.
- Rejected unsafe direct identity changes and made explicit data replacement
  the safe offline path.
- Hardened stale/cancelled Datafeed transitions and workspace restoration.
- Added deterministic per-document CSS ownership and release.
- Added browser regression coverage for direct data, Datafeed success/failure,
  cancellation, stale responses, workspace restoration, multiple instances,
  CSS isolation, RTL/theme controls, keyboard controls, repeated lifecycle
  cleanup, and responsive rendering.
- Added the internal benchmark:widget command in
  scripts/widget-benchmark.mjs. It is a measurement tool, not a public API.

## Verification matrix

All commands below ran locally in the cloud environment. Chromium means the
configured system HeadlessChrome 154 binary; it is not evidence for other
browser engines or physical devices.

| Command | Result |
| --- | --- |
| npm run build | PASS |
| npm run typecheck | PASS |
| npm test | PASS — 387/387 Node tests |
| ./node_modules/.bin/playwright test tests/browser/widget.spec.ts --project=chromium | PASS — 4/4 |
| ./node_modules/.bin/playwright test tests/browser/widget.spec.ts --project=mobile-chrome | PASS — 4/4 emulated |
| npm run test:browser | PASS — 39/39 Chromium tests |
| npm run test:react:browser | PASS — 38/38 React/Studio Chromium tests |
| npm run test:react:production | PASS — 1/1 Next.js production test |
| npm run package:smoke | PASS — local tarball installed by ESM consumer |
| npm run package:check | PASS — local dry-run only |
| npm run distribution:check | PASS — 562 files, no package problems |
| npm run studio:check | PASS — no React/Next runtime dependency in Core |
| npm run api:inventory | PASS — 319 runtime and 736 type exports inventoried |
| npm run api:diagnostics | PASS_ADDITIVE_REVIEW_REQUIRED — no removals or incompatible changes found |
| npm run api:check | FAIL — inherited open gate; no removals, three historical declaration-hash changes |
| npm run stress:ci | PASS — 0 orphan failures, 0 Worker orphans, 0 remaining canvases |
| npm run benchmark:browser | PASS — raw Canvas2D baseline rerun |
| npm run benchmark:widget | PASS — Widget-specific 1k/10k/100k and lifecycle measurements |

The api:check failure is unchanged in scope from the prior baseline review. It
reports no removals and the following changed hashes:

- openkline:runtime:Chart
- openkline:type:WorkspaceDocument
- openkline:type:WorkspaceRestoreOptions

The protected baseline was not edited or re-generated.

## Performance and memory evidence

### Widget-specific benchmark

Workload: ten repeated mount/unmount rounds, direct data replacement, Datafeed
transitions, and event-to-next-visual-frame measurements in HeadlessChrome 154.
The pan/zoom values include waiting for the next requestAnimationFrame; they
are not raw synchronous method costs and are not universal FPS guarantees.

| Candles | Create ms | Replace ms | Pan median/p95 ms | Zoom median/p95 ms | Datafeed transition ms | Destroy ms | Heap before destroy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 9.7 | 5.6 | 16.6 / 16.8 | 16.6 / 17.4 | 23.8 | 0.9 | 6,936,142 |
| 10,000 | 25.5 | 16.0 | 16.6 / 17.2 | 16.7 / 17.2 | 39.2 | 0.3 | 29,655,546 |
| 100,000 | 173.0 | 151.2 | 16.7 / 16.9 | 16.6 / 17.0 | 500.3 | 0.3 | 203,152,285 |

Repeated mount/unmount measured 10 rounds at 4.0 ms median and 15.4 ms p95.
For every size, Widget diagnostics changed from 8 DOM listeners, 15 Chart
subscriptions, one canvas, one style, and no pending request before destroy to
zero listeners, zero subscriptions, zero canvas, zero style, and no pending
request after destroy. The document-level canvas count returned to its
pre-existing example-chart baseline of one; Widget-owned canvas count was zero.

### Existing raw Canvas2D baseline

The existing npm run benchmark:browser workload remained healthy in the same
HeadlessChrome 154 environment:

| Candles | RAF FPS | Frame median/p95 ms | Load ms |
| ---: | ---: | ---: | ---: |
| 1,000 | 63.63 | 16.7 / 16.7 | 29.9 |
| 10,000 | 62.01 | 16.7 / 16.9 | 120.4 |
| 100,000 | 62.41 | 16.7 / 16.9 | 1,765.1 |

The raw run observed 588,047,115 bytes before destroying the 100k chart,
4,042,252 bytes after destruction, and zero remaining canvases. These are
environment/workload observations, not a promise of universal performance.

## Resource and lifecycle evidence

The Widget owns one Chart, one canvas, DOM listeners, Chart subscriptions, and
one shared style reference per instance. destroy() is idempotent, aborts
pending Datafeed and storage work, disposes plugin handles, destroys the Chart,
releases the style reference, removes the root, and clears observable listeners.
The focused tests and stress:ci found no orphan subscriptions, Workers, or
canvases. No Widget Worker, timer, broker connection, credentials, or mandatory
network service was introduced.

## Browser, accessibility, and CSP gates

Verified:

- Chromium desktop behavior, interaction, responsive layout, RTL, theme,
  keyboard-operable native controls, and cleanup.
- Mobile Chrome viewport/device emulation for the same Widget scenarios.
- Existing React/Studio Chromium and Next.js production consumers.

Not verified or unavailable in this cloud environment:

- Playwright-managed Firefox.
- Playwright-managed WebKit and Mobile Safari emulation.
- Physical Android/iOS devices.
- Formal WCAG conformance, screen-reader, assistive-technology, or CSP
  acceptance testing.

The Widget has semantic labels, focus-visible styles, live status/error regions,
RTL DOM direction, and responsive control sizing, but those features do not
close the formal accessibility gate.

## Acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Reproduce or classify identity mismatch | PASS | Baseline diagnostic reproduced ETH-USD relabeling of BTC-USD candles |
| Correct confirmed identity behavior | PASS | Confirmed/requested state separation and explicit direct replacement identity |
| Define offline and Datafeed behavior | PASS | Internal policy and browser regressions above |
| Prevent stale/failed identity commits | PASS | Abort/generation handling and failed-request test |
| Resolve CSS lifecycle/isolation within scope | PASS | Weak per-document registry and 8/8 focused browser matrix |
| Handle restrictive CSP honestly | DOCUMENTED LIMITATION | Inline-style contract remains; no unsupported CSP claim |
| Deterministic resource cleanup | PASS | Widget diagnostics, stress cleanup, zero Widget canvases/styles |
| Preserve public/Core contracts | PASS | Root and React exports unchanged; no financial/replay changes |
| Relevant regressions | PASS except inherited API gate | Node, Chromium, React, production, package, distribution, Studio, stress pass |
| Authorized Git delivery | PASS | Implementation and regression commits pushed; report delivery synchronized |

The only unresolved verification gates are the inherited API baseline review,
unsupported browser/device/accessibility/CSP gates, and the separate public
Widget API decision. None is silently marked as passed.

## Remaining work and exclusions

- Obtain a separate owner decision before any root export, package subpath,
  @openkline/widget package, or public compatibility promise.
- Decide whether a future public contract should support CSP nonces, external
  stylesheets, Shadow DOM, or cross-realm iframe containers.
- Keep Firefox, WebKit, Mobile Safari, physical-device, formal accessibility,
  legal, release, and API-baseline gates open until independently verified or
  approved.
- Do not begin Phase 16.4.1 under this report.

## Git delivery

The implementation and regression commits used Conventional Commits and the required author
and committer identity:

~~~
962883759c1ce3ec0a2394134e15cf48acd66a3e fix(widget): harden data identity and style lifecycle
author    Akira Yuzai <yuzai.akira@gmail.com>
committer Akira Yuzai <yuzai.akira@gmail.com>

37f67386f83c4dc73fe4f86b2b461aa197e2d3dc test(widget): cover repeated identity-bound data updates
author    Akira Yuzai <yuzai.akira@gmail.com>
committer Akira Yuzai <yuzai.akira@gmail.com>
~~~

They were pushed directly to origin/main without force-push or history rewrite.
The report delivery commit was df20590ae45cb8d5543f6b7ab8fa24b2325a8751.
The final documentation-only amendment must verify:

~~~
HEAD == origin/main
working tree clean
author and committer == Akira Yuzai <yuzai.akira@gmail.com>
~~~

No release, tag, npm publication, license change, or public Widget API
adoption was performed.

