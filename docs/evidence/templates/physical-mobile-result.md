# Physical Mobile Verification Result

Emulation is not physical evidence. Complete one sheet per device/browser.

```text
Date (UTC):
Build SHA:
Operator:
Device model:
OS / version:
Browser / version:
DPR:
Viewport (portrait / landscape):
Studio URL / host mode:
```

## Procedure checklist

| Step | Expected | Actual | Classification |
| --- | --- | --- | --- |
| Cold-load Studio | Chart + Object Tree usable | | PASS / FAIL / BLOCKED / NOT TESTED |
| Portrait → landscape → portrait | Panels remain hit-testable | | |
| Touch place drawing | Drawing appears; Object Tree updates | | |
| Hide / Show / Lock from Object Tree | Touch targets usable; state persists | | |
| Chart Settings / Rename dialog | Opens; dismissible; not permanently occluded | | |
| Virtual keyboard over inputs | Primary actions remain reachable | | |
| Pinch-zoom / pan chart | No accidental modal blocking | | |
| Scroll / overflow | No trapped scroll; safe-area respected where applicable | | |
| CSP console (if Widget host) | No style-src violations for required assets | | |
| Screen reader (TalkBack / VoiceOver) | Optional AT pass recorded separately | | |

## Evidence attachments

| Kind | Path / URL |
| --- | --- |
| Screenshot / recording | |
| Console log | |

## Session classification

Overall: PASS / FAIL / BLOCKED / NOT TESTED

Notes:
