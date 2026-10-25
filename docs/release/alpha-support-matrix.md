# OpenKline `0.1.0-alpha.1` support matrix

Status terms are intentionally narrow: **Verified** means the listed local
evidence passed; **Blocked by environment** means the required test could not
launch; **Unverified** means no claim is made; **Unsupported** means outside
the alpha scope. Verified local evidence is not a production-support promise.

## Package and framework consumers

| Environment | Status | Evidence and boundary |
| --- | --- | --- |
| Vanilla JavaScript (ESM) | **Verified** | Fresh candidate archive install loaded public ESM datafeed, indicator, drawing, plugin, and KlineScript APIs. |
| TypeScript | **Verified** | Fresh archive install passed public core/React declaration compilation. |
| React | **Verified** | Fresh archive install passed React SSR import/render and typed `FinancialChart` consumption. Browser-device behavior remains subject to the browser rows below. |
| Next.js App Router | **Verified** | Independent archive-only Next.js 16.4.3 webpack production build passed; this is not a general guarantee for every Next.js version/configuration. |
| CommonJS | **Unsupported** | The public package exposes an ESM import entry and declarations only. |
| Vendor datafeeds, broker execution, credentials | **Unsupported** | Core supplies vendor-neutral datafeed contracts and reference adapters only. |

## Browser evidence

| Project | Status | Executable and run provenance | Scope |
| --- | --- | --- | --- |
| Chromium desktop | **Verified** | `npm run browser:diagnostic`; `/usr/bin/chromium`, Chromium `154.0.8037.57` on Debian GNU/Linux 13, Playwright `1.64.1`; 3/3 desktop tests passed. This is a system-installed browser, not Playwright-managed Chromium. | Rendering, series/indicators/Bollinger fill, pan/zoom, crosshair, panes, drawings, resize, plugins, KlineScript, workspace, and cleanup in the existing suite. |
| Mobile Chrome emulation | **Verified** | Same system Chromium with Playwright Pixel 7 emulation; 3/3 mobile-project tests passed. The descriptor user agent identifies Chrome 156 while the launched Chromium binary reports `154.0.8037.57`; the binary version is authoritative for this run. | Touch/drawing behavior in emulator only; **not physical-device testing**. |
| Firefox | **Blocked by environment** | Required Playwright Firefox build 1555 executable is absent. No system Firefox was substituted. | No browser behavior claim. |
| WebKit | **Blocked by environment** | Required Playwright WebKit build 2370 executable is absent. No system Safari/WebKit was substituted. | No browser behavior claim. |
| Mobile Safari emulation | **Blocked by environment** | Requires the unavailable managed WebKit build 2370 and iPhone 13 descriptor. | Not physical-device testing; no behavior claim. |
| Physical Android/iOS devices | **Unverified** | No device-lab or handset evidence exists. | Do not infer from browser emulation. |

The portable five-project workflow is `npm run browser:verify`. It accepts only
Playwright-managed executables and writes machine-readable results, diagnostics,
and artifact hashes. Its local result is **Blocked by environment**, including
managed Chromium, because no matching managed artifacts are installed. See
[`browser-verification.md`](./browser-verification.md) for the trusted-machine
procedure and [`phase-5-3-verification.md`](../reports/phase-5-3-verification.md)
for the final evidence record.

## Compatibility expectations

This is the first proposed public alpha. APIs may change before a stable
release; consumers should pin the exact prerelease version and test upgrades in
their own target browsers. There is no prior public OpenKline version or stable
migration path. Breaking changes will be documented in release notes rather
than silently changing a published archive.
