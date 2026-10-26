# Local release-candidate readiness checklist

The authoritative local status command is:

```bash
npm run release:readiness
```

It writes a timestamped, ignored evidence directory below
`artifacts/release-readiness/`, including `summary.json` and one stdout/stderr
pair per gate. It uses explicit statuses: `PASS`, `FAIL`, `BLOCKED`,
`NOT TESTED`, and `REQUIRES OWNER APPROVAL`. A local engineering PASS does not
override legal, browser, accessibility, visual, physical-device, or owner
approval blockers.

## Automated local gates

- repository branch, upstream, and clean worktree;
- public API compatibility;
- TypeScript, Node unit/integration tests, and React/Next browser tests;
- system Chromium diagnostic and Canvas2D benchmark;
- package portability, distribution contents, package smoke, and independent
  consumers;
- license inventory validation and root/example npm audits;
- Next.js production build;
- Playwright-managed cross-browser verification.
- compact trusted-machine browser evidence consistency:
  `npm run evidence:browser:check`.
- optional Studio-only managed-browser verification:
  `npm run studio:browser:verify`; its matrix is separate from standalone
  library acceptance and reports `PASS`, `BLOCKED`, or `FAIL`.
- rendered Studio contrast audit and reduced-motion smoke coverage;

## Manual/approval gates

- effective project license and copyright authority;
- third-party license texts and notices;
- approved Firefox/WebKit/Mobile Safari evidence;
- manual assistive-technology/accessibility review;
- approved visual regression baselines;
- physical Android/iOS evidence;
- owner-approved package version, release channel, and publication action.

Phase 8.6.2 distinguishes the compact GitHub evidence gate from local browser
availability. The evidence consistency gate may be `PASS` when the exact
source SHA, 70 records, provenance, and sanitization validate. The local
managed-browser runner may remain `BLOCKED` in this restricted environment;
that does not permit the cloud to claim it executed Firefox, WebKit, or mobile
projects. The original trusted-machine archive SHA-256 values are recorded
provenance and are not recomputed unless the archives are transferred through
an authorized channel.

Phase 8.8.2 additionally distinguishes the standalone library matrix from
the private Studio matrix. Aggregate Studio failures from a trusted
supplemental probe remain open until named failures and traces are available
or a reproducible fix is independently verified. System Chromium emulation
does not certify Playwright WebKit or mobile Safari.

The command never publishes npm packages, creates tags or releases, changes the
effective license, uses GitHub Actions, or selects a public version/channel.
The existing `npm run release:check` remains a historical broad hard gate; use
`release:readiness` for the explicit status model required by Phase 8.5.
