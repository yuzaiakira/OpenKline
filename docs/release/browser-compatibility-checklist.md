# Browser compatibility checklist

The project uses Playwright `1.64.1` and formal cross-browser acceptance must
use its managed browser artifacts. Browser names, versions, and status below
are evidence for this environment only.

## Required projects

| Project | Required artifact | Current status |
| --- | --- | --- |
| Chromium | Playwright Chromium 154 | Verified only as a local system-Chromium diagnostic; managed artifact is unavailable here |
| Firefox | Playwright Firefox build 1555 (Firefox 157) | Blocked: official executable unavailable |
| WebKit | Playwright WebKit build 2370 (WebKit 27.2) | Blocked: official executable unavailable |
| Mobile Chrome | Chromium 154 with Pixel 7 emulation | Verified only as local system-Chromium emulation; managed artifact is unavailable here |
| Mobile Safari | WebKit build 2370 with iPhone 13 emulation | Blocked with WebKit |

## Behavior checklist

For each available project, run the existing Playwright suite and record
rendering, indicators, filled Bollinger Bands, pan/zoom, crosshair, multi-pane
layout, drawing pointer/touch interactions, resize behavior, and cleanup.
The current Chromium and Mobile Chrome suites cover these behavior assertions;
the other projects have not been run successfully in this environment.

```bash
npm run test:browser
npm run test:browser:compat
npm run browser:diagnostic
```

Those local commands retain the cloud's configured Chromium diagnostic setup.
For portable formal evidence use `npm run browser:verify`, which has no system
browser executable path and writes a transfer-ready report. See
[`browser-verification.md`](./browser-verification.md).

`browser:diagnostic` is the provenance record for the current system Chromium
tests. Its `verified-local-diagnostic` result must remain distinct from a
Playwright-managed result.

The compatibility command must be run with the exact managed artifacts. It is
not acceptable to replace Firefox/WebKit with system browsers, pretend Safari
is WebKit, bypass TLS verification, or download an untrusted binary. Supported
acquisition options are, in order: an existing compatible Playwright cache,
the official pinned Docker image, the documented official artifact repository,
or a checksum-verified offline transfer from a trusted machine.

## Evidence to record

For every project, record the git commit, Playwright version, browser build and
user agent, operating system, test command, pass/fail counts, and any launch or
artifact error. Keep blocked and not-tested results separate from failures.
The current environment has an official CDN/Docker acquisition restriction;
the blocked launches must remain open in Phase 2 and downstream release gates.

## Phase 8.8.10 current source boundary

The Phase 8.8.10 source changes include a WebKit-safe generic touch fallback in
the test harness, bounded responsive multi-chart action controls, deferred
ResizeObserver resize application, and a separately asserted mobile indicator
state transition. Local system-Chromium tests cover these engineering changes;
they are not substitutes for the managed browser projects above. The trusted
Phase 8.8.9 focused result remains six records with one pass and five
failures, and the current source has not yet received a trusted Playwright
WebKit, Firefox, Mobile Chrome, or Mobile Safari rerun. Keep those gates open.
