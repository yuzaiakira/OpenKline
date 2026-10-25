# Browser compatibility checklist

The project uses Playwright `1.64.1` and must use its managed browser
artifacts. Browser names, versions, and status below are evidence for this
environment only.

## Required projects

| Project | Required artifact | Current status |
| --- | --- | --- |
| Chromium | Playwright Chromium 154 | Verified: 3/3 tests |
| Firefox | Playwright Firefox build 1555 (Firefox 157) | Blocked: official executable unavailable |
| WebKit | Playwright WebKit build 2370 (WebKit 27.2) | Blocked: official executable unavailable |
| Mobile Chrome | Chromium 154 with Pixel 7 emulation | Verified: 3/3 tests |
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
```

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
