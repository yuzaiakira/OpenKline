# OpenKline Phase 8.9.2 — Official Playwright Environment Recovery

## Final technical verdict

**`BLOCKED — OFFICIAL BROWSER ENVIRONMENT UNAVAILABLE`**

The official five-browser matrices were **not** executed in this agent session.
The P0 product fix remains unverified for digest-locked WebKit/Mobile Safari
acceptance until the host-terminal runner below completes successfully.

## 1. Exact tested / intended source

| Role | SHA |
| --- | --- |
| Historical browser-certified baseline | `bb3f1cad028b126920fa26a75f7ec158ebc56e3c` |
| P0 behavioral fix | `02e92874fa60e176099acb3eb96953858e31e87e` |
| Latest Phase 8.9.1 verification tip | `d7e9f568d80322a33ce2f4164e1c81299b8e1c16` |
| Branch used | `qa/phase-8-9-1-cross-browser-regression` → work branch `qa/phase-8-9-2-official-browser-verification` |

Ancestry at investigation start:

- `02e9287` ∈ ancestry of `d7e9f56`: **YES**
- `bb3f1ca` ∈ ancestry: **YES**
- Working tree clean before branch creation
- Product behavior under test remains the `02e9287` fix (later commits are
  docs/test harness only)

Phase 8.8.17 historical official evidence (for environment comparison only):

- Standalone: status `verified`, expected **75**, unexpected **0**, exit 0
- Browsers in container: Chromium `156.0.8078.4`, Firefox `157.0`, WebKit `27.2`
- Paths: `/ms-playwright/chromium-1248`, `firefox-1555`, `webkit-2370`
- Source of that historical run: `bb3f1ca` — **not** certification of `02e9287`

## 2. Root cause of Docker inaccessibility

### What is *not* the problem

| Hypothesis | Finding |
| --- | --- |
| Docker binary missing | **False** — `/usr/bin/docker` present (29.7.2) |
| Docker Engine uninstalled | **False** — `docker.service` / `docker.socket` units exist |
| User not in docker group on host | **False** — `getent group docker` → `docker:x:953:akira` |
| Daemon proven stopped | **Unproven from agent** — socket is invisible; host previously ran Phase 8.8.17 successfully and docker netns mounts remain visible |

### Actual blocker (agent execution environment)

The Cursor **agent-exec** shell runs in a **private mount namespace** that
overlays `/run` with a tiny read-only tmpfs:

```text
/run  run   tmpfs  rw,...
/run  none  tmpfs  ro,nosuid,nodev,noexec,size=4k,uid=1000,gid=1001,...
```

Effects observed inside the agent:

- `/run` listing is empty (`docker.sock` **absent**)
- `docker version` / `docker info` fail with
  `dial unix /var/run/docker.sock: connect: no such file or directory`
- Agent credentials show only `groups=akira,nobody` even though host group DB
  lists `akira` in `docker`
- `CURSOR_EXTENSION_HOST_ROLE=agent-exec`
- Host PID 1 is still `systemd`, confirming this is a sandboxed view of a
  normal Manjaro host—not a missing Docker installation

This matches the Phase 8.9.1 symptom but refines the diagnosis: the daemon is
not proven dead; the **agent cannot see the host Docker API socket**.

Escaping that sandbox from the agent is intentionally not attempted.

Evidence capture: `artifacts/phase-8-9-2/evidence/agent-docker-blocker.txt`

## 3. Corrective action taken / required

### Taken in this phase

1. Confirmed source ancestry and prior handoff docs.
2. Distinguished binary / group / socket / mount-namespace failure modes.
3. Authored a host-terminal recovery & verification runner that reuses the
   Phase 8.8.17 digest-pinned workflow:
   `scripts/phase-8-9-2-host-official-browser-verify.sh`
4. Recorded this blocker report (no fake matrix greens).

### Required on the Manjaro host terminal (owner)

Open a normal terminal **outside** Cursor agent-exec and run:

```bash
cd /home/akira/Projects/git-contribute/OpenKline
git checkout qa/phase-8-9-2-official-browser-verification
# Confirm host can see Docker before the long run:
ls -l /run/docker.sock
docker info >/dev/null
docker image inspect \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  --format '{{index .RepoDigests 0}}' || docker pull \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea

chmod +x scripts/phase-8-9-2-host-official-browser-verify.sh
./scripts/phase-8-9-2-host-official-browser-verify.sh
```

The script will:

1. Refuse to run if it detects the agent `/run` overlay or missing socket.
2. Verify the exact image digest.
3. Dual-mount gitdirs when needed (worktree-safe).
4. `npm ci` **inside** the Ubuntu Playwright image (no host `node_modules` reuse).
5. Run targeted `tests/browser/datafeed-lifecycle.spec.ts` on all five portable projects.
6. Run positive portable controls.
7. Independently run `npm run browser:verify` and `npm run studio:browser:verify`.
8. Run Node/package/packed-lifecycle/benchmark checks.
9. Write `artifacts/phase-8-9-2/official-<stamp>/decision.json`.

Security notes intentionally followed:

- No automatic `usermod -aG docker` (membership already present on host).
- No unauthenticated TCP Docker API.
- No privileged containers.
- Prefer reuse of the existing digest-pinned image before pull.

## 4. Verified official container digest

**Not verified in this agent session** (socket invisible).

Required digest (must match host `docker image inspect`):

`sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`

Image: `mcr.microsoft.com/playwright:v1.64.1-noble`  
Browsers path: `/ms-playwright`  
Expected managed versions (from Phase 8.8.17 container evidence):

- Chromium `156.0.8078.4`
- Firefox `157.0`
- WebKit `27.2`

## 5. Five-project targeted lifecycle results

| Project | Result in this session |
| --- | --- |
| chromium | **NOT RUN** (official container unreachable from agent) |
| firefox | **NOT RUN** |
| webkit | **NOT RUN** |
| mobile-chrome | **NOT RUN** |
| mobile-safari | **NOT RUN** |

Harness ready: `tests/browser/datafeed-lifecycle.spec.ts` (expanded in 8.9.1).

Provisional non-official host evidence from Phase 8.9.1 remains separate and
must not be reused as digest-locked acceptance.

## 6. Standalone full-matrix results

**NOT EXECUTED** in this session.

## 7. Studio full-matrix results

**NOT EXECUTED** in this session.

## 8. Node/package results

Not re-executed in this session beyond confirming the source tip and harness.
Phase 8.9.1 already recorded `npm test` 184/184 and package gates against the
same product ancestry; those remain historical until the host runner refreshes
them under the official container workflow.

## 9. Performance comparison

**NOT RE-RUN** in this session. Prior Phase 8.9.1 local observation (~61.9 FPS /
~0.65 ms append / 0 canvases at 100k) is not official-container evidence for
8.9.2.

## 10. Remaining functional defects or blockers

1. **Primary blocker:** Cursor agent-exec mount namespace hides `/run/docker.sock`.
2. No product regression identified in this phase (no official matrix executed).
3. Owner must run `scripts/phase-8-9-2-host-official-browser-verify.sh` on the
   Manjaro host to close the blocker and upgrade the verdict.

## 11. Evidence location and Git SHA

- Blocker diagnostics: `artifacts/phase-8-9-2/evidence/agent-docker-blocker.txt`
- Host runner: `scripts/phase-8-9-2-host-official-browser-verify.sh`
- Prior successful environment reference archives:
  `/home/akira/Projects/git-contribute/OpenKline-phase-8-8-17-wt/`
- This report branch: `qa/phase-8-9-2-official-browser-verification`
- After host success, append real matrix counts to a follow-up docs commit on
  the same branch (or a dedicated evidence branch) without rewriting history.

### Upgrade path

Only after the host runner reports:

- lifecycle exit 0 on all five projects
- `browser:verify` exit 0 with discovered counts recorded
- `studio:browser:verify` exit 0 with discovered counts recorded
- matching digest + managed browser versions

may the verdict become:

**`FUNCTIONALLY VERIFIED — FULL FIVE-BROWSER PASS`**
