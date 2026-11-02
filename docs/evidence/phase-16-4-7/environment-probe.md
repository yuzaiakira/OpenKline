# Phase 16.4.7 — Environment Probe

Date (UTC): 2026-11-02  
Build SHA at probe: `faa891eea52755072c1bd2abd876a581842fcaab` (starting HEAD)  
Host: Manjaro Linux `7.2.9-1-MANJARO` x86_64  
Display: `DISPLAY=:1`, Wayland `wayland-0`

## Assistive technology

| Tool | Status | Notes |
| --- | --- | --- |
| NVDA | **NOT AVAILABLE** | Windows-only; not present on Linux host |
| VoiceOver (macOS) | **NOT AVAILABLE** | Requires macOS |
| VoiceOver (iOS) | **NOT AVAILABLE** | Requires physical iOS device |
| TalkBack | **NOT AVAILABLE** | Requires physical Android + TalkBack |
| Orca / espeak / speech-dispatcher | **NOT INSTALLED** | `pacman` packages absent; not a substitute for NVDA/VoiceOver/TalkBack evidence |

## Physical devices

| Interface | Status | Notes |
| --- | --- | --- |
| `adb devices` | Empty | Android SDK platform-tools present; daemon started; **no devices attached** |
| `idevice_id -l` | Failed / empty | libimobiledevice present; **Unable to retrieve device list** |
| `xcrun` | Not found | No Xcode iOS Simulator tooling |
| USB Apple/Android devices (lsusb) | None detected | No matching device IDs |

## Feasible verification on this host

- Automated Playwright keyboard / axe / target-size / reflow checks: **YES**
- Manual keyboard-only inspection via desktop Chromium under X11: **YES** (automated coverage preferred for evidence)
- Formal AT sessions: **NO** → record **NOT TESTED**
- Physical Android / iOS: **NO** → record **NOT TESTED**

## Conclusion

Phase 16.4.7 must keep formal AT and physical-device release gates **OPEN / NOT TESTED**. Engineering work concentrates on expandable automated WCAG evidence, reproducible result templates, and regression preservation.
