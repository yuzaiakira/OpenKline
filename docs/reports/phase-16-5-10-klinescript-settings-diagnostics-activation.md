# Phase 16.5.10 — KlineScript Applied Indicator Settings, Diagnostics & Safe Activation

## 1. Executive summary

Phase 16.5.10 delivers an Applied Script Inspector with supported input-parameter
editing, safe compile/reapply (restore previous revision on Worker failure),
richer diagnostics, and a mandatory imported-script quarantine: embedded
KlineScript in imported workspace JSON is preserved but not executed until the
user explicitly Activates it.

## 2. Starting repository state

- Branch: `main`
- Starting HEAD: `d35e6720dbd39471f04832e5137feb901406cb61`
- `origin/main` matched local tip; working tree clean
- Prior phase: 16.5.9 KlineScript Studio integration

## 3. Existing KlineScript capabilities

Compiler/Worker/`addScriptIndicatorAsync`; Studio My Scripts; panel-scoped apply;
workspace `{ programId, source }` persistence; restore recompiles local charts.

## 4. Parameter support assessment

**Fully supported** for declared `input.int` / `input.float` / `input.bool` via
compiler metadata (`KlineScriptInputMetadata`: label, defaults, min/max).

## 5. Selected implementation scope

Inspector + parameter controls + safe reapply + import quarantine/activation.
No new language version, marketplace, or Public Widget API.

## 6. Applied Script Inspector

Selecting an applied KlineScript row opens a region showing display name,
instance/panel/pane/program ids, parameter controls, Open in Editor, Reapply,
and Remove.

## 7. Source revision lifecycle

Editor source may differ from the applied revision. Reapply compiles the editor
revision + drafted parameters before mutating the chart.

## 8. Compilation workflow

`gateStudioKlineScriptCompile` + `validateStudioScriptParameters` run before
remove/create.

## 9. Compiler diagnostics

Failures surface in inspector notices with compiler messages; invalid reapply
does not remove the previous instance when compile fails pre-mutation.

## 10. Runtime diagnostics

Worker failures after remove attempt restore of the previous source/parameters
(`reapplyStudioKlineScriptIndicator`).

## 11. Safe reapply

Validate → remove → Worker add (same instance id/pane). On failure → restore
previous revision when possible (`restoredPrevious` flag).

## 12. Instance identity and panel ownership

Panel-scoped selection; stale panel rejection; selection restored after
successful reapply.

## 13. Imported-script trust audit

**Finding:** Import → `applyDocument` → Chart `restoreWorkspace` previously
compiled and executed embedded script indicators automatically.

## 14. Actual activation policy

`quarantineStudioImportedScripts` strips chart script indicators on import,
stores them in additive `pendingImportedScripts`, and requires explicit
**Activate**. Self-declared approval flags in JSON are ignored. Local Save of
already-applied scripts continues to restore/execute under the Chart contract
after the user has activated and saved.

## 15. Security corrections

Import path always quarantines; Activate uses Worker apply; Dismiss drops
pending without execution; CSP unchanged.

## 16. Workspace persistence

Additive optional `pendingImportedScripts` on Studio workspace v1; fingerprints
include pending state.

## 17. Dirty-state integration

Dirty on apply/reapply/remove/activate/dismiss; not on inspector open or
Compile-only.

## 18. Replay and datafeed behavior

Script mutations remain disabled during replay; datafeed unchanged.

## 19. Worker lifecycle

AbortController cancel preserved; stale completion cleanup preserved; restore
path on reapply failure.

## 20. Accessibility

Inspector and pending-activation regions with labeled controls; formal AT OPEN.

## 21. Performance implications

Metadata discovery compiles only selected/inspected sources; no catalog-wide
compile.

## 22. Unit and integration tests

Extended `tests/studio-klinescript.test.ts` (parameter discovery, quarantine,
reapply restore).

## 23. Browser E2E results

- Applied Script Inspector reapply/fail-preserve PASS
- Import quarantine + Activate PASS
- React browser suite **74/74** PASS

## 24. Regression verification

| Gate | Result |
|---|---|
| TypeScript | PASS |
| Unit tests | PASS **447/447** |
| api:check | PASS (additive) |
| studio:check | PASS |
| package:smoke | PASS |
| distribution:check | PASS |
| stress:ci | PASS |
| test:react:browser | PASS **74/74** |
| test:browser | PASS **54** / **4 skipped** |
| Firefox / WebKit | NOT TESTED |

## 25. Known limitations

- Reapply remove-then-add is not a transactional Chart API; restore-on-failure is best-effort
- Worker is not an OS sandbox
- Formal AT / physical devices OPEN
- No enum input type beyond int/float/bool

## 26. Remaining roadmap work

Deeper script debug tooling; managed Firefox/WebKit; formal accessibility gates;
remaining Phase 7.5.1 product items.

## 27. Git delivery

- Starting HEAD: `d35e6720dbd39471f04832e5137feb901406cb61`
- Implementation: `1494bda02393432a9371d1fc28059ddc2664b90c`
  (`feat(studio): add Applied Script Inspector and import quarantine`)
- Documentation: `docs(product): record phase 16.5.10 KlineScript settings and activation` (local tip)
- Local commits only. No push, no tags, no release, no Cursor co-author trailer.
