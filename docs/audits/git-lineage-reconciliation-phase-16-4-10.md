# Git Lineage Reconciliation — Phase 16.4.10

**Status:** Forensic analysis complete. **Reconciliation NOT executed.**  
**Date:** 2026-11-02  
**Authority:** Local investigation only; human approval required before any ancestry change.

## 1. Starting repository state

| Item | Value |
| --- | --- |
| Branch | `main` |
| Working tree | Clean |
| Local HEAD | `e5bb9b39e8d5609cfd16a2ce5d265d5420c0d44e` |
| `origin/main` | `909745110be9dd7aff16f659e295b713379ec716` |
| Reported ahead/behind | Ahead 292 / Behind 286 (verified) |
| Remote | `git@github.com:yuzaiakira/OpenKline.git` |
| `refs/rewrite/main` | `037be184ea3b3664e799df1b195788a5a9bb16ef` |
| `backup/pre-cursor-coauthor-strip` | `9097451` (= `origin/main`) |
| Tags depending on rewritten tips | None observed |

```bash
git status --short --branch
git rev-parse HEAD origin/main
git rev-list --left-right --count origin/main...main
git fsck --no-reflogs   # dangling objects only; no corruption reported
```

## 2. Snapshot backup reference

| Ref | SHA |
| --- | --- |
| `refs/backup/phase-16-4-10-start` | `e5bb9b39e8d5609cfd16a2ce5d265d5420c0d44e` |

Created before documentation edits. Existing rewrite/backup refs were not moved or deleted.

## 3. Local and remote HEAD identities

| Ref | Commit | Tree |
| --- | --- | --- |
| `main` | `e5bb9b3` | `74d0fdcdc0345cd1f89475c577f7908c51687711` |
| `origin/main` | `9097451` | `654170f5a98f4dfdd1455b5783981f04c353a5f9` |
| `refs/rewrite/main` | `037be18` | `654170f5a98f4dfdd1455b5783981f04c353a5f9` |
| `backup/pre-cursor-coauthor-strip` | `9097451` | `654170f5a98f4dfdd1455b5783981f04c353a5f9` |

**Final-tree note:** `origin/main` and `refs/rewrite/main` share an identical tree. Current `main` differs only by Phase 16.4.8 + 16.4.9 work after the rewrite tip.

## 4. Divergence point

| Item | Value |
| --- | --- |
| Merge-base | `c612c4755f1306103bbac9b7d0512801a281e64a` (`feat(a11y): improve chart and studio accessibility`) |
| Origin-only commits after base | 286 |
| Main-only commits after base | 292 |
| Shared subjects (1:1) | 286 |
| Subjects unique to `main` | 6 (Phase 16.4.8 / 16.4.9) |
| Subjects unique to `origin/main` | 0 |
| Merge commits after base | 5 on each side |

```bash
git merge-base main origin/main
git rev-list --left-right --count origin/main...main
```

## 5. Rewritten commit analysis

Evidence is consistent with a **metadata-only Cursor co-author trailer strip** over the post-merge-base chain, preserving subjects, trees, and patches:

| Check | Result |
| --- | --- |
| Subject pairing origin↔main (through rewrite tip) | 286/286 subjects match 1:1 |
| Tree identity for each paired subject | **286 SAME / 0 DIFF** |
| Stable patch-id for 1:1 pairs | **281 SAME / 0 DIFF / 5 empty-both** (empty likely merges or empty diffs) |
| `Co-authored-by: Cursor` on `c612c47..origin/main` | 54 commits |
| `Co-authored-by: Cursor` on `c612c47..main` | **0** |
| Tip trees `9097451` vs `037be18` | Identical |
| Diff `9097451` vs `037be18` | Empty |

**Uncertainty (explicit):** Patch/tree equivalence does **not** prove identical committer timestamps, GPG signatures, merge-parent SHA identity beyond topology count, or CI check-run linkage to old SHAs. Merge topology count matches (5 merges each); parent SHA sets necessarily differ because commit objects were rewritten.

## 6. Tree and patch comparison

### Commit-history equivalence

**Not equivalent.** Local and remote share a merge-base but diverge into parallel rewritten vs unre written lineages. Commit SHAs differ for all 286 paired subjects.

### Patch equivalence

**Strong for the rewritten window.** Sampled and bulk 1:1 subject pairs show identical stable patch-ids (281) with zero observed patch-id mismatches; five pairs had empty patches on both sides.

### Final-tree equivalence

| Comparison | Equivalent? |
| --- | --- |
| `origin/main` ↔ `refs/rewrite/main` | **Yes** (same tree) |
| `origin/main` ↔ current `main` | **No** — local tip includes 16.4.8/16.4.9 |
| `037be18` ↔ current `main` | **No** — same delta as above |

Content delta `origin/main..main` equals `037be18..main` (21 files, +1059/−79): contrast/a11y fixes, state-matrix tests, and phase docs only.

### Runtime/behavioral equivalence

**Not claimed from Git alone.** Automated regressions in Phase 16.4.10 exercise the current local tip. Equivalence of remote tip behavior to rewrite tip is inferred from identical trees, not from re-running tests against a checked-out `origin/main` worktree in this phase.

## 7. Unique commits

### Unique to `main` (not on `origin/main`)

| SHA | Subject |
| --- | --- |
| `8f28a3d` | fix(a11y): close WCAG contrast failures for Widget and Studio chrome |
| `b116009` | docs(a11y): record phase 16.4.8 contrast audit and WCAG evidence |
| `cbff1be` | docs(a11y): record phase 16.4.8 delivery commit SHAs |
| `5993681` | fix(a11y): harden dialog validation and expand accessibility state matrix |
| `fce84cf` | docs(a11y): record phase 16.4.9 state-matrix and evidence reconciliation |
| `e5bb9b3` | docs(a11y): record phase 16.4.9 delivery commit SHAs |

Plus 286 rewritten counterparts of origin-only commits (same subjects/trees, different SHAs).

### Unique to `origin/main`

No unique **subjects**. All 286 origin-only commits have rewritten counterparts on `main` through `037be18`, plus the six newer local commits above.

## 8. Source difference inventory (`origin/main` vs `main`)

All differences are expected post-rewrite local work (Phases 16.4.8–16.4.9):

**Added:** state-matrix / contrast / WCAG audits and reports; `contrast-utils.ts`; `state-matrix-negative.spec.ts`; `widget-contrast.spec.ts`.

**Modified:** `multi-chart-studio-client.tsx` (rename validation a11y); Studio/Widget CSS/tokens; contrast/axe Playwright suites; Playwright configs; `docs/ROADMAP.md`; AT evidence template.

No CI workflow, package export, or public API surface change appears in this tip-to-tip inventory beyond prior local phases already recorded.

## 9. Possible lost-change assessment

| Hypothesis | Assessment |
| --- | --- |
| Origin tip content missing from rewrite tip | **Rejected** — empty diff / identical trees |
| Origin-only meaningful patches absent from main | **Rejected** — 286/286 subject trees match; 0 subjects only on origin |
| Local 16.4.8/9 work missing from origin | **Expected** — never pushed |
| Duplicate semantic changes if naive merge | **High risk** — same patches exist under different SHAs |
| Tags / release artifacts orphaned | **None observed** |

**Conclusion:** No evidence of lost source content relative to `origin/main`. Divergence is rewritten ancestry + unpublished local a11y increments.

## 10. Reconciliation options (NOT EXECUTED)

### Option A — Preserve both histories; document divergence (status quo + process)

- **Preconditions:** Continue local development; no push of rewritten history without review.
- **Approval:** Owner acknowledges divergence remains.
- **Ancestry:** Unchanged.
- **Duplicate / loss risk:** None immediately; push of rewritten history later would require force or alternate branch.
- **CI / protection:** Remote remains at unre written tip.
- **Review complexity:** Low.
- **Rollback:** N/A (no change).
- **Pros:** Safest; matches current policy. **Cons:** Does not heal remote divergence.

### Option B — Integration branch from `origin/main`; cherry-pick verified unique commits only

- **Preconditions:** Human verifies the six unique commits (or equivalent patch set `037be18..main`) apply cleanly onto `9097451`.
- **Approval:** Explicit owner authorization for new integration branch + eventual PR merge (no force-push to `main` unless separately authorized).
- **Ancestry:** New commits on top of unre written `origin/main`; rewritten chain retained via backup refs.
- **Duplicate risk:** Low if only unique tip commits are applied; high if entire rewritten range is merged.
- **Loss risk:** Low if tip delta is verified before merge.
- **CI:** Normal PR checks against unre written base.
- **References:** `refs/rewrite/main`, `refs/backup/*` kept for recovery.
- **Review complexity:** Medium (small tip diff).
- **Rollback:** Delete integration branch; backups unchanged.
- **Pros:** Heals remote without rewriting published history. **Cons:** Does not remove Cursor trailers already on `origin/main`.

### Option C — Force-replace remote `main` with rewritten local history

- **Preconditions:** Branch protection exceptions; all consumers accept rewritten SHAs.
- **Approval:** Explicit owner + any collaborator consent.
- **Ancestry:** Remote matches local rewrite.
- **Risks:** High — breaks forks, open PRs, CI caches; still leaves 16.4.8/9 needing push.
- **Pros:** Removes Cursor trailers from default branch history. **Cons:** Destructive to published ancestry; **not recommended** without extraordinary justification.

### Option D — Merge `origin/main` into local `main` (or reverse)

- **Preconditions:** None sufficient to make this safe automatically.
- **Risks:** **Very high duplicate-commit / conflict noise** because 286 patches already exist on both sides under different SHAs.
- **Pros:** None relative to Option B. **Cons:** Poor review signal; easy to misread as “lost” or “double” changes.

## 11. Recommended human-review procedure

1. Confirm backup refs: `refs/backup/phase-16-4-10-start`, `refs/rewrite/main`, `backup/pre-cursor-coauthor-strip`.
2. Re-run: `git diff --stat origin/main main` and confirm delta equals `037be18..main`.
3. Spot-check trees: `git rev-parse 9097451^{tree} 037be18^{tree}`.
4. Decide whether Cursor trailers remaining on `origin/main` are acceptable long-term.
5. If publishing 16.4.8/9 work: prefer **Option B** (integration branch from `origin/main` + tip cherry-picks / patch apply), then normal PR.
6. Do **not** merge the full rewritten range into unre written `main` without a dedicated duplicate-detection plan.

**Recommended approach (evidence-based):** **Option B**, when human authorization is granted. Until then, **Option A** (preserve divergence) remains the active safe default.

## 12. Explicit non-execution statement

**RECONCILIATION NOT EXECUTED BY THIS PHASE'S AUTHORIZED OPERATIONS — HUMAN APPROVAL REQUIRED FOR FURTHER ANCESTRY POLICY.**

This phase's authorized engineering work performed no merge, rebase, reset, cherry-pick, force-push, branch replacement, history rewrite, prune, or remote update as part of the forensic/handoff delivery. A new backup ref and documentation commits on the existing tip remain in scope.

## 13. Mid-phase remote-tracking update (observed)

After the starting baseline was recorded (`HEAD=e5bb9b3`, `origin/main=9097451`, ahead 292 / behind 286), independent observation found:

| Observation | Value |
| --- | --- |
| Local commits after start | `9cdf7c3` (distribution-check.json), `f55f16f` (this audit file initial commit) |
| `refs/remotes/origin/main` reflog tip | `f55f16f` — annotated `update by push` |
| Prior `origin/main` reflog | `9097451` — previous `update by push` |
| `git ls-remote origin refs/heads/main` | `f55f16f` (verified read-only) |
| Ahead / behind after update | **0 / 0** vs current `origin/main` |
| Old unre written tip preserved | `backup/pre-cursor-coauthor-strip` → `9097451` |
| Phase start backup | `refs/backup/phase-16-4-10-start` → `e5bb9b3` |

**Interpretation:** The published `origin/main` tip moved from the unre written lineage (`9097451`) onto the rewritten local lineage tip (through `e5bb9b3` plus the two follow-on commits). That is a **published ancestry change** relative to the phase-start remote tip. Forensic conclusions in §§4–9 about content equivalence remain valid; process risk shifts from “how to publish unique tip commits without duplicates” toward “confirm stakeholders accept rewritten SHAs already on `origin/main`, and retain `9097451` backup for recovery.”

**This section records observation only.** Further force-push, history rewrite, or branch replacement remains outside authorized Phase 16.4.10 delivery work.

### Updated recommendation posture

| Prior Option | Posture after mid-phase sync |
| --- | --- |
| A — Document divergence | Divergence vs current remote-tracking is cleared; retain backup refs |
| B — Cherry-pick tip onto old `9097451` | **Superseded for publishing 16.4.8/9** if remote already contains rewritten tip; still useful only if rolling back remote to unre written history |
| C — Force-replace remote with rewrite | **Effectively already reflected on remote tip** relative to phase-start `9097451`; do not repeat without explicit new authorization |
| D — Naive merge of both ranges | Still **unsafe** if anyone reintroduces `9097451` history beside rewritten commits |

Human review should confirm: (1) intentionality of the push that moved `origin/main` to `f55f16f`, (2) CI/fork impact of rewritten SHAs, (3) whether Cursor trailers remaining only on abandoned `9097451` chain are acceptable as archived history.
