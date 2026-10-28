# Release gates

This matrix preserves the existing acceptance criteria. It does not authorize a
publication, tag, stable release, GitHub Action, or a change to the browser
compatibility policy.

| Gate | Status | Required evidence |
| --- | --- | --- |
| Project license and copyright authority | **Pending owner/counsel approval** | Counsel-approved source-available final text, ownership/provenance record, compatibility disclosure, commercial-exception authority, effective `LICENSE`, and matching manifest metadata |
| Third-party attribution and notices | **Blocked** | Review license texts and redistribution obligations, especially CC-BY and LGPL metadata in the private Next.js example tree |
| Dependency integrity and vulnerability audit | **Verified locally** | Lockfile inventory validation and zero-advisory root/example npm audits |
| Package contents and public exports | **Verified locally** | `npm run package:audit`, package smoke, and tarball consumer verification |
| Local preview candidate | **Verified locally** | `npm run preview:prepare` creates ignored `0.1.0-alpha.1` review artifacts with SHA-256 manifest |
| Vanilla/TypeScript/React/Next consumption | **Verified locally** | `OPENKLINE_CHROMIUM_EXECUTABLE_PATH=… npm run preview:verify` uses only installed package archives |
| Chromium local behavior | **Verified locally, non-portable evidence** | Existing cloud config uses its explicitly configured host Chromium; it is not substituted for Playwright-managed Firefox/WebKit acceptance |
| Firefox, WebKit, Mobile Safari | **Blocked by environment** | Run `npm run browser:verify` on a trusted host with Playwright-managed artifacts and transfer its report |
| Mobile Chrome emulation | **Verified locally, non-portable evidence** | Existing Pixel 7 project passes against the local configured Chromium; physical-device coverage is not claimed |
| KlineScript and plugin security regressions | **Verified locally** | Node tests cover parser/AST limits, runtime budgets, cancellation, host restrictions, workspace validation, and plugin rollback/disposal |
| Stable 1.0 release | **Blocked** | Every prior gate plus final API review and explicit owner release authorization |

## Decision rule

Only the owner may authorize a developer preview after the license and
distribution obligations are complete. A limited browser-support preview may
be proposed with Firefox/WebKit/Mobile Safari disclosed as unverified, but it
must not be presented as full cross-browser support. A stable 1.0 release
remains blocked until the mandatory browser policy is met or the owner records
a revised policy.


## Phase 8.8.18 gate refresh

Automated managed-browser compatibility for source `bb3f1ca` is **PASS** via
Phase 8.8.17 evidence (75+125). The following remain open and independently
block release:

| Gate | Status |
| --- | --- |
| Project license and copyright authority | REQUIRES OWNER APPROVAL |
| Third-party attribution and notices | BLOCKED |
| Formal accessibility / screen reader | NOT TESTED |
| Approved visual baselines | REQUIRES OWNER APPROVAL |
| Physical Android | BLOCKED — DEVICE UNAVAILABLE |
| Native iOS Safari | BLOCKED |
| Stable / preview publication | REQUIRES OWNER APPROVAL |

Firefox/WebKit/Mobile Safari managed executables are no longer “blocked by
environment” for the verified `bb3f1ca` revision; physical-device and legal
gates still are.
