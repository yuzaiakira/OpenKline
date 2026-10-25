# OpenKline Phase 6.0 core reliability

Verification date: 2026-10-25 (Asia/Tehran)

Status: **Implemented and locally verified for the completed 6.0 increments.**
OpenKline Studio, mobile/accessibility acceptance, managed Firefox/WebKit/
Mobile Safari, package-consumer retesting, and Phase 6 final acceptance remain
open.

## Confirmed defects and fixes

| Area | Confirmed behavior | Fix |
| --- | --- | --- |
| React workspace/data precedence | The prior adapter restored a workspace and then always invoked `setData(candles ?? [])`; omitted candles therefore erased restored data. | Omitted props now preserve restored state. Explicit props are applied after workspace restoration; an explicit empty array is distinct from omission. |
| React array lifecycle | Fresh but equivalent indicator, drawing, script, and plugin arrays removed and recreated resources, losing editable drawing state and reactivating plugins. | Stable IDs and compact configuration signatures reconcile resources by identity. Equivalent arrays preserve live resources; actual declarative changes replace only the affected resource. |
| REST pagination | A server-provided absolute `next` URL could change origin while reusing configured headers, and fetch redirects had no adapter-level target validation. | HTTP(S), origin, loop, redirect, malformed-payload, and header-forwarding checks now guard every page. Foreign trusted origins require explicit configuration and do not receive headers by default. |
| Viewport resize/update | Resize and non-primary updates recalculated default visible count, discarding a user zoom; corrections could move a historical viewport. | Resize/corrections preserve visible count and position where possible. Live appends remain right-edge anchored. `fitContent` and `resetView` are public navigation commands. |

## Public API and behavior changes

- `Chart.fitContent()` shows the complete shared time range.
- `Chart.resetView()` restores default density and follows latest data.
- `RestDatafeedOptions` adds `trustedPaginationOrigins`,
  `forwardHeadersToTrustedOrigins`, and `maxRedirects`.
- React indicator and script-indicator declarations accept a stable top-level
  `id`. Drawing identity continues to use `options.id`.

These changes preserve the framework-independent core and existing REST cursor
integrations. The only intentional REST compatibility restriction is that an
absolute cross-origin page/redirect is rejected unless its origin is explicitly
trusted; configured headers remain origin-bound unless their forwarding is
explicitly enabled.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 54 Node tests. New deterministic regressions cover
  unsafe protocols, untrusted absolute URLs, redirects, header forwarding,
  pagination loops, malformed pages, cancellation, viewport resize, historical
  correction, live right-edge anchoring, fit content, and reset view.
- `npm run test:react:browser`: passed, one Chromium/Next.js Strict Mode
  browser workflow. It verifies initial mount, equivalent rerenders, drawing
  persistence, stable indicator/plugin identity, workspace restoration without
  data props, imperative deletion followed by declarative recovery, runtime
  theme update, unmount, and remount cleanup.
- Two consecutive `npm run benchmark:browser` observations recorded expected
  host variability at 100,000 candles: the first was 40.34 FPS with 93.1 ms
  frame-interval p95, while the immediate repeat was 62.43 FPS with 16.9 ms
  p95, 0.336 ms newer-bar update work, and 1.1 ms frame-work p95. The 1k/10k
  repeat recorded 65.46/63.65 FPS. The repeat aligns with the prior local
  ~62 FPS evidence; no rendering-path optimization was introduced from a
  single noisy sample. These are fixture-specific local measurements, not a
  universal performance claim.
- `npm run package:smoke`: passed by packing and importing the public ESM core
  artifact into a clean temporary consumer. `npm run build --prefix
  examples/nextjs-app-router`: passed with the React lifecycle verification
  route compiled in the private App Router example.

The React browser run uses local system Chromium and is not a managed
cross-browser or physical-device claim. The existing Firefox, WebKit, and
Mobile Safari gate remains blocked by unavailable managed Playwright binaries.

## Architecture review result

`Chart` remains the browser adapter for public lifecycle, interaction,
datafeed, rendering, indicators, drawings, plugins, and workspace composition.
The Phase 6 audit found no safe extraction that would reduce coupling without
moving public orchestration logic or duplicating state. The smaller
`ChartModel`, `DrawingEngine`, `PluginRegistry`, renderer, datafeeds, and new
React reconciliation boundary retain clear ownership. No cosmetic file split
was made.

## Open requirements

- Studio implementation, object management, workspace UX, responsive Chromium
  workflow, packed-consumer checks, and a post-Studio benchmark are now
  recorded in `docs/reports/phase-6-studio-verification.md`.
- Keep the formal Firefox/WebKit/Mobile Safari, physical-device, assistive
  technology, visual-regression, and pending licensing gates open.

## Git verification

The implementation increment is committed as
`ba642d7e164b577a9d2117758d370975041d29d7`
(`feat(reliability): harden chart lifecycle`) with both author and committer
recorded as `Akira Yuzai <yuzai.akira@gmail.com>`. It was pushed directly to
`origin/work`; a post-push `git fetch origin work` resolved `FETCH_HEAD` to the
same commit. No history rewrite or GitHub Actions workflow was used.
