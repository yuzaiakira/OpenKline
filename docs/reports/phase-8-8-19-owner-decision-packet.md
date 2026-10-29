# OpenKline Phase 8.8.19 Owner Decision Packet

Status: **NOT RELEASE READY** — decisions requested; none auto-approved.

Product baseline (automated managed-browser PASS):
`bb3f1cad028b126920fa26a75f7ec158ebc56e3c`

Documentation / audit tip for this packet branch: see git HEAD of
`docs/phase-8-8-19-owner-readiness` (based on Phase 8.8.18 audit
`ee8a07e96f0c8ddb2d5eaf06e594890ce0526117`).

This packet is readable without the rest of the repository. Supporting
details live in the linked reports. Recommended options are **not** approvals.

## Owner checklist (top)

| # | Decision | Status | Approver |
| ---: | --- | --- | --- |
| 1 | Confirm copyright authority and counsel-reviewed license text | REQUIRES OWNER APPROVAL | Owner + counsel |
| 2 | Activate (or reject) effective `LICENSE` / package `license` metadata | REQUIRES OWNER APPROVAL | Owner + counsel |
| 3 | Decide redistribution scope for Next.js Studio example + third-party notices | REQUIRES OWNER APPROVAL / BLOCKED | Owner + counsel |
| 4 | Approve / reject / request changes on visual candidates | NOT REVIEWED | Owner / designated reviewer |
| 5 | Set accessibility conformance target (if any) and authorize AT review | REQUIRES OWNER APPROVAL | Owner |
| 6 | Authorize physical Android and/or native iOS test sessions | BLOCKED until devices/access | Owner |
| 7 | Choose release scope and sign publication authorization | REQUIRES OWNER APPROVAL | Owner |

**Prohibited until the relevant rows are approved:** npm publish, git tags,
GitHub Releases, repository-visibility changes, LICENSE/NOTICE activation,
public distribution channels.

---

## Executive summary

| Category | State |
| --- | --- |
| Complete | Automated managed-browser 200/200 PASS; Node/package/API/distribution checks green on audit path; Phase 8.8.17 evidence validated; decision + preparation docs ready |
| Needs human testing | Full keyboard workflow audit beyond smoke; screen-reader observation; owner visual inspection |
| Needs physical device | Android touch/drawing/orientation; native iOS Safari |
| Needs legal counsel | Ownership, patent/trademark, compatibility with GPL/AGPL/MIT/Apache apps, notice obligations for LGPL/CC-BY example deps |
| Needs owner decision | License adoption, notices scope, visual baseline, a11y target, release scope |
| Still prohibited | Publication, license activation, inventing device/AT results |

Overall verdict: **NOT RELEASE READY**

---

## A. Licensing and intellectual property

### Current verified facts

- Proposed policy: custom **source-available** Community License v0.1 draft
  (`docs/legal/openkline-source-available-license-proposal.md`).
- Policy intent preserved: free consumer apps; public required source; no ads /
  paid features / subscriptions; voluntary donations without product benefit;
  unrelated company revenue alone is not disqualifying; other use needs separate
  written authorization.
- **Not** OSI-approved Open Source; no SPDX ID assigned by this project.
- No effective root `LICENSE`, `NOTICE`, or package `license` field.
- Git author metadata is **not** ownership proof.

### Pending decisions

Approve, revise, or reject the proposed text; name copyright holder; set
patent/trademark position; define commercial-exception process.

### Options

1. Proceed with custom source-available (after counsel).
2. Request counsel revisions.
3. Defer all distribution until a different license strategy is chosen.
4. Keep internal-only / no-license-grant status.

### Tradeoffs

Custom terms match the free/source-available consumer goal but conflict with
parts of the OSI definition and can clash with GPL/AGPL-style apps (see
`docs/legal/license-compatibility-analysis.md`).

### Recommended next action

Owner + qualified counsel complete
`docs/legal/ownership-and-approval-checklist.md` and
`docs/legal/counsel-review-package.md`. **Do not** activate LICENSE from this
phase.

### Who / evidence / status

| Field | Value |
| --- | --- |
| Approver | Authorized copyright holder + qualified counsel |
| Evidence | Legal docs under `docs/legal/`; adoption procedure is post-approval only |
| Status | **REQUIRES OWNER APPROVAL** |

---

## B. Third-party attribution and notices

### Current verified facts

- Root `openkline` and `@openkline/react` ship **zero** runtime npm dependencies
  in packed archives; root lockfile entries are primarily development-only.
- Previously flagged **CC-BY-4.0** (`caniuse-lite`) and **LGPL-3.0-or-later**
  (`@img/sharp-libvips-*`) appear in the **Next.js Studio example** lockfile
  scope (`shippedInRootPackage: false`).
- Several `@img/sharp-libvips-*` packages lack bundled LICENSE text in
  `node_modules` on this host → notice packaging is **BLOCKED** until texts are
  obtained or the example is excluded from distribution.

### Pending decisions

Whether the private Next.js example is redistributed; if yes, how notices and
LGPL source/offer obligations are satisfied.

### Options

1. Distribute **core + React only**; keep Studio private / non-redistributed.
2. Redistribute Studio with counsel-approved NOTICE and LGPL/CC-BY compliance.
3. Replace/remove sharp image pipeline from any redistributed example.

### Tradeoffs

Excluding Studio simplifies the published surface. Including it requires
real notice texts and LGPL analysis—not lockfile SPDX alone.

### Recommended next action

Owner decides distribution scope; counsel reviews
`docs/reports/phase-8-8-19-attribution-review.md`. Do not invent NOTICE content.

### Who / evidence / status

| Field | Value |
| --- | --- |
| Approver | Owner + counsel |
| Evidence | `docs/audits/license-inventory.json`; attribution review report |
| Status | **BLOCKED** (notice texts / redistribution decision) |

---

## C. Visual baseline approval

### Current verified facts

Phase 8.8.18 candidates still present on the trusted host; SHA-256 verified:

| File | Viewport | SHA-256 |
| --- | ---: | --- |
| `studio-dark.png` | 1280×900 | `0e7d12ac…88267c` |
| `studio-light.png` | 1280×900 | `6bdeebb0…021eed` |
| `studio-mobile.png` | 390×844 | `1ff2c217…24a0b98` |

Browser recorded in difference reports: Chromium `155.0.8059.79` (local
diagnostic). Locale `en-US`, TZ `UTC`, DPR `1`, reduced motion `reduce`.

Local review index (not in git):
`OpenKline-browser-verification/phase-8-8-18-visual-candidates/OWNER-REVIEW-INDEX.html`

### Pending decisions

APPROVE / REJECT / CHANGES REQUESTED per candidate. All start **NOT REVIEWED**.

### Options

Approve set as baseline; reject with notes; request new candidates (managed
Firefox/WebKit, different fixtures).

### Tradeoffs

Approving local-Chromium-only baselines does not prove managed Firefox/WebKit
pixel parity. Rejecting blocks visual gate but does not undo browser functional PASS.

### Recommended next action

Owner opens the local HTML index and records decisions. Byte equality ≠ approval.

### Who / evidence / status

| Field | Value |
| --- | --- |
| Approver | Owner / designated visual reviewer |
| Evidence | Local PNGs + `docs/release/visual-regression-review.md` |
| Status | **REQUIRES OWNER APPROVAL** / decisions **NOT REVIEWED** |

---

## D. Accessibility and assistive technology

### Current verified facts

- Automated Studio a11y/contrast/dialog/reduced-motion smoke: PASS (Phase 8.8.18).
- Assisted keyboard smoke: PASS-smoke only.
- axe-core: **NOT TESTED** (not a dependency).
- Orca: **not installed** → screen-reader review **NOT TESTED**.

### Pending decisions

Whether to adopt a WCAG 2.2 AA (or other) target; authorize AT installation /
external AT lab; accept smoke-only vs require full manual plan.

### Options

1. Keep “automated smoke only” for internal builds.
2. Require completion of
   `docs/reports/phase-8-8-19-accessibility-review-plan.md` before any public
   preview claim.
3. Defer formal conformance indefinitely; disclose limitation.

### Tradeoffs

Formal AT review raises quality and cost. Claiming conformance without it is
disallowed.

### Recommended next action

Owner sets target; execute review plan with real AT when available.

### Who / evidence / status

| Field | Value |
| --- | --- |
| Approver | Owner |
| Evidence | Accessibility review plan; Phase 8.8.18 audit |
| Status | Automated smoke **PASS**; formal / AT **NOT TESTED** / **REQUIRES OWNER APPROVAL** |

---

## E. Physical Android and native iOS verification

### Current verified facts

- `adb` available; **no devices attached**.
- No real iPhone/iPad / Safari access on this Linux host.
- Playwright Pixel 7 / iPhone 13 projects are **emulation only**.

### Pending decisions

Authorize device sessions; choose USB vs private LAN; who executes checklist.

### Options

Provide Android device + USB debugging; provide iOS device + test access; keep
gates BLOCKED and disclose “emulation only” forever for those platforms.

### Tradeoffs

Hardware closes real-touch risk. Leaving BLOCKED is honest but limits support claims.

### Recommended next action

Follow `docs/reports/phase-8-8-19-android-test-preparation.md` when a device
appears; keep iOS blocked until real Safari access exists.

### Who / evidence / status

| Field | Value |
| --- | --- |
| Approver | Owner (device authorization) |
| Evidence | Preparation docs; empty `adb devices` |
| Status | Android **BLOCKED: DEVICE UNAVAILABLE**; iOS **BLOCKED** |

---

## F. Release scope and authorization

### Current verified facts

- Packages: `openkline@0.1.0`, `@openkline/react@0.1.0` (candidate versions only).
- No publication authorized.
- Support matrix for `bb3f1ca`: automated five managed browsers PASS; physical
  and formal a11y/visual/legal gates open.

### Pending decisions

Internal-only vs private technical preview vs public alpha vs future stable;
registry/channel; who may publish; rollback owner.

### Options / tradeoffs

See `docs/reports/phase-8-8-19-release-decision-matrix.md`. Broader scope needs
more closed gates.

### Recommended next action

Owner completes the release decision matrix **after** license/notices (and any
preview claims about devices/a11y) are decided. Do not publish from this phase.

### Who / evidence / status

| Field | Value |
| --- | --- |
| Approver | Owner |
| Evidence | Release decision matrix; owner-approval.md |
| Status | **REQUIRES OWNER APPROVAL** |

---

## Gate status snapshot

| Gate | Status |
| --- | --- |
| Automated managed-browser compatibility | **PASS** (`bb3f1ca`) |
| Effective license | **REQUIRES OWNER APPROVAL** |
| Third-party notices | **BLOCKED** |
| Visual baseline | **REQUIRES OWNER APPROVAL** (NOT REVIEWED) |
| Formal accessibility / screen reader | **NOT TESTED** |
| Physical Android | **BLOCKED** |
| Native iOS Safari | **BLOCKED** |
| Release authorization | **REQUIRES OWNER APPROVAL** |
| Overall release readiness | **FAIL / NOT RELEASE READY** |
