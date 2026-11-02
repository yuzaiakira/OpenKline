# Phase 16.4.10 — Git Lineage Reconciliation & External Verification Handoff

**Engineering status:** COMPLETE (external AT/physical/WCAG gates remain OPEN)  
**Date:** 2026-11-02  
**Local commits only. No push. No history rewrite. No reconciliation executed.**

## 1. Executive summary

At phase start, independently verified that local `main` (`e5bb9b3`) and `origin/main` (`9097451`) diverged by **292 ahead / 286 behind** from merge-base `c612c47`. The divergence matches a **metadata-only Cursor co-author trailer rewrite**: all 286 origin-only subjects pair 1:1 with rewritten commits through `refs/rewrite/main` (`037be18`) with **identical trees** and **matching stable patch-ids** (281 same; 5 empty-both; 0 mismatches). Tip trees of phase-start `origin/main` and `refs/rewrite/main` were identical. The only source delta vs that origin tip was expected Phase **16.4.8–16.4.9** work (21 files). No lost origin content was found.

**Mid-phase observation:** `origin/main` moved to the rewritten lineage tip (`f55f16f` via push), clearing ahead/behind vs remote-tracking while preserving `9097451` at `backup/pre-cursor-coauthor-strip`. Forensic content conclusions stand; governance review of that published ancestry change remains required.

Preserved phase-start HEAD at `refs/backup/phase-16-4-10-start`. Prepared actionable AT and physical-device handoffs. Formal WCAG 2.2 AA remains OPEN/NOT CLAIMED. Available regressions passed. **Public Widget API / public release: NOT AUTHORIZED.**

**FURTHER RECONCILIATION / ANCESTRY POLICY CHANGES: HUMAN APPROVAL REQUIRED.**

## 2. Starting Git baseline

| Item | Verified value |
| --- | --- |
| Branch | `main` (clean) |
| HEAD | `e5bb9b39e8d5609cfd16a2ce5d265d5420c0d44e` |
| `origin/main` | `909745110be9dd7aff16f659e295b713379ec716` |
| Ahead / behind | 292 / 286 |
| Merge-base | `c612c4755f1306103bbac9b7d0512801a281e64a` |
| `refs/rewrite/main` | `037be184ea3b3664e799df1b195788a5a9bb16ef` |
| `fsck` | Dangling objects only; no corruption reported |

Matches prior Phase 16.4.9 reported baseline.

## 3. Preservation measures

| Ref | SHA |
| --- | --- |
| `refs/backup/phase-16-4-10-start` | `e5bb9b39e8d5609cfd16a2ce5d265d5420c0d44e` |

Existing `refs/rewrite/main` and `backup/pre-cursor-coauthor-strip` left untouched.

## 4. History investigation findings

- Shared subjects after merge-base: **286**; subjects only on origin: **0**; subjects only on main: **6** (16.4.8/9).
- Paired trees: **286 SAME / 0 DIFF**.
- Cursor trailers on `c612c47..origin/main`: **54**; on rewritten `main` chain: **0**.
- Merge commits after base: **5** each side.
- No tags observed pointing at rewritten tips.
- Full analysis: `docs/audits/git-lineage-reconciliation-phase-16-4-10.md`.

## 5. Content-equivalence assessment

| Concept | Verdict |
| --- | --- |
| Commit-history equivalence | **No** — parallel rewritten vs unre written SHAs |
| Patch equivalence (rewritten window) | **Strong** — 281 identical patch-ids; 0 diffs |
| Final-tree equivalence (`origin` ↔ rewrite tip) | **Yes** |
| Final-tree equivalence (`origin` ↔ current `main`) | **No** — local 16.4.8/9 only |
| Runtime/behavioral equivalence | **Not claimed from Git alone**; current tip verified by regressions below |

## 6. Reconciliation recommendation

**At phase start:** Prefer Option B (tip commits onto unre written `9097451`) or Option A (document divergence); avoid Option D naive merges; Option C only with extraordinary approval.

**After mid-phase remote tip sync to rewritten lineage (`f55f16f`):** Publishing 16.4.8/9 via Option B is largely superseded. Human review should confirm intentionality of the push that replaced `9097451`, retain backups (`refs/backup/phase-16-4-10-start`, `backup/pre-cursor-coauthor-strip`, `refs/rewrite/main`), and assess fork/CI impact of rewritten SHAs. Do not re-force-push or re-merge divergent ranges without new authorization.

**FURTHER RECONCILIATION / ANCESTRY POLICY CHANGES: HUMAN APPROVAL REQUIRED.**

This phase's remaining delivery commits are local documentation only unless a human separately authorizes push.

## 7. AT verification handoff

Actionable scenarios AT-S01–S12 for NVDA, macOS VoiceOver, iOS VoiceOver, TalkBack:

`docs/guides/external-at-physical-device-handoff.md`

| Environment | Status this phase |
| --- | --- |
| NVDA | **NOT TESTED** |
| VoiceOver macOS | **NOT TESTED** |
| VoiceOver iOS | **NOT TESTED** |
| TalkBack | **NOT TESTED** |

## 8. Physical-device handoff

Scenarios PM-S01–S11 in the same guide; protocol cross-links retained.

**PHYSICAL ANDROID: NOT TESTED**  
**PHYSICAL IOS: NOT TESTED**

Emulation / Docker WebKit are not substitutes.

## 9. WCAG evidence gaps

Register: `docs/audits/wcag-2-2-aa-assessment-phase-16-4-10.md`

Remaining incomplete: AT environments; physical mobile; 2.4.11 sticky overlays PARTIAL; 1.4.4 resize; 1.4.12 text spacing; dense-panel contrast PARTIAL; formal AA claim **OPEN**.

## 10. Implemented fixes

None. No verified in-scope implementation defect discovered during this phase. Concurrent React-repeat build race produced a transient TS7006 during overlapping `clean` with another suite; clean `npm run typecheck` afterward **PASS**. Not treated as a product defect.

## 11. Regression verification

Environment: Manjaro Linux `7.2.9-1-MANJARO`, Node `v24.19.0`, npm `11.17.0`.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | PASS (twice, including post-race) |
| Unit | `npm test` | **393/393** pass, 0 skip |
| API | `npm run api:check` | PASS |
| Studio separation | `npm run studio:check` | pass |
| Package smoke | `npm run package:smoke` | PASS |
| Distribution | `npm run distribution:check` | PASS |
| Stress CI | `npm run stress:ci` | pass |
| React browser (default parallel) | `npm run test:react:browser` | **59/59** |
| React ×5 stability | same ×5 | Runs 2–5: **59/59** each; run 1 **FAIL** (build race with concurrent clean — environment) |
| React production project | `npm run test:react:production` | **1/1** (portfolio-backtesting only in that config) |
| Chromium browser | `npm run test:browser` | **53 passed, 4 skipped** |
| Firefox Playwright | `npx playwright test --project=firefox …` | **BLOCKED** — managed Firefox binary missing |
| WebKit / Docker WebKit | Not re-executed this phase | Prior phase evidence retained; host WebKit not claimed |
| NVDA / VO / TalkBack / physical | — | **NOT TESTED** |

## 12. Outstanding risks

1. Published ancestry changed mid-phase: remote `main` now follows rewritten SHAs; consumers pinned to `9097451` need migration awareness. Backups retain the unre written tip.
2. Cursor co-author trailers remain on the abandoned unre written chain (`9097451` lineage), not on current rewritten `main`.
3. External AT and physical gates OPEN — block formal AA and release claims.
4. Firefox/WebKit managed browsers not installed in this agent environment for re-run.
5. Release readiness still requires owner authorization beyond Git sync; formal WCAG/AT/physical remain open.
6. Intentionality of the mid-phase push that moved `origin/main` to `f55f16f` must be confirmed by a human owner.

## 13. Final release-gate status

| Gate | Status |
| --- | --- |
| Engineering handoff (this phase) | COMPLETE |
| Git reconciliation / ancestry policy | OPEN — human confirmation of mid-phase remote rewrite publication; no further rewrite authorized here |
| Assistive technology | OPEN — NOT TESTED |
| Physical devices | OPEN — NOT TESTED |
| Formal WCAG 2.2 AA | OPEN / NOT CLAIMED |
| Public Widget API | **NOT AUTHORIZED** |
| Public release | **NOT AUTHORIZED** |

## 14. Local commit delivery

| Role | SHA |
| --- | --- |
| Phase-start HEAD (backup) | `e5bb9b39e8d5609cfd16a2ce5d265d5420c0d44e` (`refs/backup/phase-16-4-10-start`) |
| Mid-phase audit tip observed on remote | `f55f16fd89f96fcc778cd26ecd3acaa3e44392b0` |
| Distribution-check chore (pre-existing mid-phase) | `9cdf7c39962376871fbf5479478ad2bafe3131a5` |
| Handoff documentation tip | `804154e9af4adb69e0e6650cc6713fbbebf72a25` |
| Delivery SHA record | *(this commit)* |

Starting HEAD for the phase: `e5bb9b3`. Backup: `refs/backup/phase-16-4-10-start`.

## Documentation paths

- `docs/reports/phase-16-4-10-git-lineage-external-verification.md` (this file)
- `docs/audits/git-lineage-reconciliation-phase-16-4-10.md`
- `docs/audits/wcag-2-2-aa-assessment-phase-16-4-10.md`
- `docs/guides/external-at-physical-device-handoff.md`
