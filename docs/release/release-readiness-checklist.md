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

## Manual/approval gates

- effective project license and copyright authority;
- third-party license texts and notices;
- approved Firefox/WebKit/Mobile Safari evidence;
- manual assistive-technology/accessibility review;
- approved visual regression baselines;
- physical Android/iOS evidence;
- owner-approved package version, release channel, and publication action.

The command never publishes npm packages, creates tags or releases, changes the
effective license, uses GitHub Actions, or selects a public version/channel.
The existing `npm run release:check` remains a historical broad hard gate; use
`release:readiness` for the explicit status model required by Phase 8.5.
