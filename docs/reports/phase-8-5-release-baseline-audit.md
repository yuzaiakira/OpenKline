# OpenKline Phase 8.5.0 release-readiness baseline audit

Baseline branch: `work`  
Baseline commit: `7a590abdc22ef09f31cdf86f0e85aff3bd24a981`  
Audit tool: `node scripts/release-baseline.mjs`

This is an engineering audit for the first public-library release candidate. It
is not a release authorization, legal opinion, effective license decision, or
claim of full browser compatibility. The machine-readable result is
[`phase-8-5-release-baseline.json`](../audits/phase-8-5-release-baseline.json).

## Product boundary

The core package remains a provider-independent and framework-independent
JavaScript/TypeScript library. Consumers own their data and may use direct
arrays, offline files, application-owned APIs, custom Datafeeds, or application-
owned WebSocket connections. React is optional, and the Next.js Studio remains
a private reference consumer. No mandatory backend, cloud service,
authentication, account, database, or external provider was introduced.

## Findings

| Area | Status | Severity | Evidence / action |
| --- | --- | --- | --- |
| Branch and upstream | PASS | P0 | `work` tracks `origin/work`. |
| Core runtime dependencies | PASS | P0 | Root package has no production dependencies. |
| React boundary | PASS | P1 | React binding uses peer dependencies and remains separate. |
| Package exports and declarations | PASS | P0 | ESM and declaration exports are present; API inventory is the next gate. |
| Worker entry points | PASS | P1 | KlineScript and Screener Worker artifacts are built. |
| Effective project license | REQUIRES OWNER APPROVAL | P0 | Proposed source-available policy is not effective or OSI-approved. |
| Third-party notices | BLOCKED | P0 | Inventory exists; actual notice/license review remains open. |
| Managed Firefox/WebKit artifacts | BLOCKED | P0 | Exact Playwright artifacts are unavailable in this environment. |
| Accessibility conformance | NOT TESTED | P1 | Formal assistive-technology review is not claimed. |
| Visual regression baselines | NOT TESTED | P1 | No approved screenshot baseline set is claimed. |

## Review scope

The baseline reviewed package manifests and exports, generated declarations,
runtime dependency boundaries, worker files, browser project configuration,
SSR/React separation, Datafeed contracts, API documentation, package/license
audits, benchmark entry points, existing release gates, and the legal/notice
status. Existing implementation was preserved; no style-only rewrite was made.

## Reproduction

```bash
npm run build
node scripts/release-baseline.mjs
cat docs/audits/phase-8-5-release-baseline.json
```

The audit intentionally records blocked and approval-dependent states instead
of converting them to a single green result. Later Phase 8.5 milestones add
API compatibility, browser handoff, lifecycle stress, accessibility/visual,
package, and local release-candidate checks.
