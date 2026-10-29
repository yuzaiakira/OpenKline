# Phase 8.8.19 Physical Android Test Preparation

Status: **PHYSICAL ANDROID — BLOCKED: DEVICE UNAVAILABLE**

Product baseline to test: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Host discovery (Phase 8.8.19): `adb` present at Android SDK platform-tools;
`adb devices` listed **no authorized devices** after daemon start.

Playwright `studio-mobile-chrome` / Pixel 7 emulation is **not** a substitute.

## Safe discovery already performed

| Check | Result |
| --- | --- |
| ADB binary | Available |
| Connected devices | None |
| USB debugging session | N/A without device |
| Public port exposure | Not enabled; not requested |

## Prerequisites (owner-authorized)

1. Physical Android phone/tablet owned or authorized by the project owner.
2. USB debugging enabled; computer authorized on the device prompt.
3. Chrome (or owner-approved browser) installed on device.
4. Local Studio/dev server for the exact baseline SHA (private; not public WAN).
5. Prefer USB; do not open insecure public ingress.

## Recommended private session (when a device appears)

### A. Confirm device

```bash
adb devices -l
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
# On-device Chrome version via Settings → Apps, or:
adb shell dumpsys package com.android.chrome | rg -i 'versionName' | head
```

Record: model, Android version, browser version, tester, date, source SHA.

### B. Private port reverse (USB)

Serve Studio locally (example port 4174 used by Studio Playwright config):

```bash
# From a clean checkout of bb3f1ca — do not modify product source for the session
npm ci
npm run build
# Start the Next example on 4174 (or documented private script)
# Then:
adb reverse tcp:4174 tcp:4174
```

Open on device: `http://127.0.0.1:4174/` (via reverse).

Do **not** use `adb reverse` as a reason to expose the host on `0.0.0.0` to
untrusted networks. Do not enable arbitrary extra forwards.

### C. Functional checklist

| # | Case | Expected | Result |
| ---: | --- | --- | --- |
| 1 | Page loads Studio | Chart canvas visible; no fatal overlay | |
| 2 | Real touch drawing | Two anchors → drawing created; counter updates | |
| 3 | Drawing snap | Anchors snap to visible OHLC as designed | |
| 4 | Pan / scroll / zoom | Chart responds; no stuck gesture | |
| 5 | Portrait ↔ landscape | Layout usable; canvas resizes | |
| 6 | Multi-chart / panel switch | Accessible selector works | |
| 7 | Form entry | Alert/paper fields accept input | |
| 8 | Alert create/remove | Lifecycle works; no page errors | |
| 9 | Paper Trading | Simulated order path works | |
| 10 | Workspace save/reload | State restores | |
| 11 | Replay | Enter/play/exit restores workspace | |
| 12 | Modal + on-screen keyboard | Rename dialog opens; field usable; Escape/Cancel | |
| 13 | Canvas lifecycle | Navigate away / remount without leaked errors | |

### D. Evidence handling

- Keep screenshots/recordings on the trusted machine only.
- Publish only sanitized text ledgers if results are later integrated.
- Any product fix → new SHA + renewed relevant verification (do not silently
  edit `bb3f1ca`).

## If still no device

Leave this gate **BLOCKED**. Continue owner license/visual/a11y decisions in
parallel. Do not claim Android PASS from emulation.

---

## Native iOS Safari preparation (companion gate)

Status: **NATIVE IOS SAFARI — BLOCKED**

Linux Playwright WebKit and iPhone 13 emulation are **not** native iOS Safari.

### Requirements to close later

| Requirement | Notes |
| --- | --- |
| Real iPhone or iPad | Owner-authorized hardware |
| Safari version recorded | Settings → Safari / OS version |
| Private test access | USB Web Inspector on macOS, or other owner-approved method — **not available on this Manjaro host alone** |
| Same product SHA | `bb3f1cad028b126920fa26a75f7ec158ebc56e3c` until a new fix SHA |
| Checklist | Load, touch drawing, gestures, dialogs/keyboard, workspace persistence, orientation, storage, replay |

### Explicit non-methods

- Do not substitute `studio-mobile-safari` Playwright results.
- Do not invent iOS outcomes on Linux.
- Do not require public hosting to “reach” an iPhone.
