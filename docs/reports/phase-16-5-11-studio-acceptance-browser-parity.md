# Phase 16.5.11 — Studio End-to-End Acceptance & Cross-Browser Workflow Parity

## 1. Executive summary

Phase 16.5.11 establishes an evidence-backed Studio acceptance baseline for the
workflows delivered in 16.5.0–16.5.10, recovers managed Firefox Studio runs,
adds imported-script quarantine persistence regressions, and corrects two
quarantine/dirty-state defects discovered during verification. Host-native
WebKit and Mobile Safari remain BLOCKED (missing ICU74/flite; Docker daemon
unavailable). Phase 7.5.1 is **not** declared fully complete.

## 2. Starting repository state

- Branch: `main`
- Starting HEAD: `dd747931e0db23cff84b6c4f8321c903c3d223b3`
- `origin/main`: `d35e6720dbd39471f04832e5137feb901406cb61` (local ahead by 2)
- Working tree clean

## 3. Phase 7.5.1 acceptance matrix

See `docs/audits/studio-phase-7-5-1-acceptance-matrix.md`.

## 4. Supported Studio capabilities

Layouts, sync, Drawing Toolbar/Properties/Object Tree, Indicator Explorer,
KlineScript editor/My Scripts/Inspector, workspace library, dirty-state guard,
imported-script quarantine + Activate/Dismiss.

## 5. Browser environment and versions

| Component | Version / path |
|---|---|
| Playwright | 1.64.1 |
| Chromium (system) | 156.0.8078.79 (`/usr/bin/chromium`) |
| Firefox (managed) | 157.0 via `~/.cache/ms-playwright/firefox-1555` |
| Host Firefox package | 159.0 (not used as Playwright substitute) |
| WebKit | Present at `webkit-2370` but launch blocked (libicu74/libflite1) |
| Docker WebKit image | Daemon unavailable this run |
| Config | `playwright.react.compat.config.ts` + `npm run test:react:compat:firefox` |

## 6. Chromium results

- `npm run test:react:browser` → **76/76 PASS**
- `npm run test:browser` → **54 PASS / 4 skipped**

## 7. Firefox results

Focused Studio workflows via `test:react:compat:firefox`:

**7/7 PASS** — dirty-state, Indicator Explorer, Drawing Toolbar, Applied Script
Inspector, import quarantine, quarantine persistence/forged trust, multi-panel
analysis restore.

## 8. WebKit results

**BLOCKED** — `browserType.launch` requires `libicu74` / `libflite1`. Docker
Playwright workflow documented but daemon not running.

## 9. Mobile emulation results

- **Mobile Chrome (Pixel 7):** quarantine + persistence + mobile panel selector
  PASS. Desktop-oriented drawing-properties and inactive-panel visibility
  assertions fail as expected under the mobile-only active-panel contract
  (not substituted as product PASS).
- **Mobile Safari:** BLOCKED (WebKit deps).

## 10–13. Workflow evidence

Covered by existing + new Chromium/Firefox E2E and unit tests (workspace,
drawing, Explorer, KlineScript, multi-panel ownership).

## 14. Imported-script quarantine regression

Verified:

- Initial import quarantines without Worker execution
- Explicit Activate uses Worker path
- Dismiss without execution
- Save before Activate → Load keeps pending (no silent apply)
- Forged `approved`/`trusted`/`scriptsApproved` metadata cannot bypass quarantine
- Re-import of already-pending documents preserves pending (fix: wipe bug)

## 15. Discovered defects

1. **Pending wipe on re-quarantine:** `quarantineStudioImportedScripts` replaced
   `pendingImportedScripts` with only newly stripped chart scripts, clearing
   already-pending records when charts were empty.
2. **Dirty-state blind to pending scripts:** fingerprints omitted
   `pendingImportedScripts`, so Dismiss/Activate did not flip Saved → Unsaved.

## 16. Implemented corrections

- Preserve and merge existing pending records; project known keys only (ignore
  forged trust fields).
- Include `pendingImportedScripts` in `studioWorkspaceContentFingerprint`.
- Refresh live fingerprint when pending list changes.
- Studio Firefox compat config + npm scripts.

## 17. Tests added or modified

- Unit: forged trust + pending preservation; fingerprint dismiss dirty
- E2E: quarantine Save/Load/Dismiss/forged trust; multi-panel acceptance restore
- Config: `playwright.react.compat.config.ts`

## 18. Standard regression verification

| Gate | Result |
|---|---|
| typecheck | PASS |
| npm test | PASS **449/449** |
| api:check | PASS (additive) |
| studio:check | PASS |
| package:smoke | PASS |
| distribution:check | PASS |
| stress:ci | PASS |
| test:react:browser | PASS **76/76** |
| test:browser | PASS **54** / **4 skipped** |
| Firefox Studio subset | PASS **7/7** |
| WebKit / Mobile Safari | BLOCKED |
| Formal WCAG / physical AT | OPEN |

## 19. API and security review

No Public Widget API publish. CSP unchanged. Quarantine strengthened; Worker
remains a resource boundary, not an OS sandbox.

## 20. Accessibility limitations

Formal WCAG and external AT remain OPEN. Automated axe/contrast suites remain
engineering evidence only.

## 21. Remaining product acceptance gaps

- Host/Docker WebKit + Mobile Safari Studio parity
- Full Firefox Studio suite beyond focused subset
- External AT / physical devices
- Phase 7.5.1 formal acceptance claim deferred

## 22. Recommended next roadmap phase

Recover WebKit via Docker/`webkit-compat` when the daemon is available, or
advance the next concrete Phase 7/8 product milestone that is not blocked on
browser recovery—without claiming Phase 7.5.1 closed.

## 23. Git delivery

- Starting HEAD: `dd747931e0db23cff84b6c4f8321c903c3d223b3`
- Implementation: `5d790cac9f496a160667e2584f9833998bfb6dca`
- Documentation: local tip (`docs(product): record phase 16.5.11…`)
- Local commits only. No push, tags, or Cursor co-author attribution.
