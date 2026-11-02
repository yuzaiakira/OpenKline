# Phase 16.4.12 — External Verification Environment Inventory

**Date (UTC):** 2026-11-02  
**Host:** Manjaro Linux `7.2.9-1-MANJARO` x86_64 (`CodeLab`)  
**Pinned OpenKline SHA:** `7b4117f6d8fc7d55b7591dfa559241a0142dcc12`  
**Session type:** Environment discovery + capability gate (no fabricated AT/device sessions)

## Probe commands (reproducible)

```bash
uname -a
echo "DISPLAY=$DISPLAY WAYLAND_DISPLAY=$WAYLAND_DISPLAY XDG_SESSION_TYPE=$XDG_SESSION_TYPE"
adb devices -l
idevice_id -l
lsusb | rg -i 'apple|iphone|ipad|samsung|google|android'
env | rg -i 'BROWSERSTACK|SAUCELABS|LAMBDATEST|AWS_DEVICE|FIREBASE_TEST|DEVICE_FARM'
docker ps --format '{{.Names}} {{.Image}}' | rg -i 'android|ios|emulator'
command -v wine; test -d "$HOME/.wine"
"$HOME/Android/Sdk/emulator/emulator" -list-avds
```

## Capability matrix

| Required target | Available on this host? | Notes |
| --- | --- | --- |
| Windows 10/11 + NVDA | **No** | Host is Manjaro Linux; no NVDA binary; no RDP/Windows host env |
| macOS + Safari + VoiceOver | **No** | Not Darwin; no Safari |
| Physical iOS + Safari + VoiceOver | **No** | `idevice_id -l` → no device; `ideviceinfo` → No device found |
| Physical Android + Chrome + TalkBack | **No** | `adb devices` empty; no matching USB mobiles in `lsusb` |
| Authorized device-farm / cloud lab | **No** | No BrowserStack/Sauce/LambdaTest/Firebase Test Lab credentials in env |
| Docker Android/iOS device containers | **No** | No matching running containers |
| Linux Chromium / Firefox (desktop) | Yes | Chromium 156 / Firefox 159 — **not** substitutes for NVDA/VO/TalkBack |
| Android SDK emulator AVD | Present (`flutter_emulator`) | **Emulation only** — must not close physical Android / TalkBack gates |
| Wine prefix | Present | **Not** authorized as Windows+NVDA evidence |

## Explicit non-substitutions

- Playwright Mobile Safari / Docker WebKit ≠ VoiceOver iOS / physical iOS.
- Android emulator / scrcpy without a physical device ≠ physical Android Chrome / TalkBack.
- axe-core / Playwright keyboard suites ≠ NVDA / VoiceOver / TalkBack sessions.
- Orca (if later installed on Linux) ≠ NVDA evidence for the release matrix.

## Conclusion

All Phase 16.4.12 primary external gates remain **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** on this execution host.
