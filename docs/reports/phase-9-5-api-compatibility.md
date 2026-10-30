# Phase 9.5 — Public API Compatibility Hardening

## Executive result

Phase 9.5 hardening is implemented for the available local environment. The
strict historical API gate remains intentionally open: the Phase 9 public
surface is additive, but the owner has not yet approved updating the stored
baseline. This report does not claim release authorization, universal browser
compatibility, or license approval.

| Item | Value |
| --- | --- |
| Phase 9.5 starting commit | `d986bf1cb53c7dcd551661e3b57a4765faea7561` |
| Historical API baseline commit | `3e7a889a94c40255bbcce210a672856cfc98b32b` |
| Phase 9.5 implementation commit | `175d94c085a418403b8299ff400ae9aafcad6db3` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Baseline policy | Historical baseline unchanged; owner approval required |
| Publication policy | No npm publication, release, tag, or license change |

## Implemented scope

- Added `npm run api:diagnostics`, a development-only TypeScript-AST report
  that explains strict declaration-hash changes without weakening
  `npm run api:check` or rewriting the baseline.
- Added isolated positive and negative compatibility fixtures covering additive
  methods, optional fields, unrelated exports, removed methods/exports,
  changed parameters and returns, optional-to-required changes, required
  properties, changed property types, and removed overloads.
- Added consumer-facing Node coverage for the root ESM API, Phase 9
  calculations, legacy version-1 workspace parsing, optional analytics state,
  empty/multiple profiles, duplicate rejection, and deterministic persistence.
- Updated Chart and workspace API documentation, public API stability guidance,
  the roadmap, and this report.

Existing chart, indicator, drawing, Datafeed, React, package, and Studio
behavior was preserved. No rendering subsystem or public API baseline was
rewritten.

## Compatibility decision packet

### Strict inventory result

The committed baseline contains 623 public surface entries. The current
inventory contains 214 runtime exports and 480 type exports, 694 entries total.
The strict comparison reports:

| Finding | Result |
| --- | --- |
| Removed exports/declarations | 0 |
| Changed declaration hashes | `openkline:runtime:Chart`, `openkline:type:WorkspaceDocument` |
| Additive surface entries | 71 |
| Strict command | `npm run api:check` — FAIL until baseline approval |
| Diagnostic command | `npm run api:diagnostics` — additive review required |

The strict result is retained as an open gate. The diagnostic result is an
explanation, not an approval.

### Exact declaration changes

The historical `Chart` class had all previously documented public methods. The
current class adds these public methods; no existing method signature was
removed or changed by the structural comparison:

```ts
public getPrimaryDrawingPaneBounds(): {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly chartWidth: number;
  readonly chartHeight: number;
} | null;
public addAnchoredVwap(options: AnchoredVwapChartOptions): AnchoredVwapApi;
public startAnchoredVwapPlacement(id: string): void;
public getAnchoredVwaps(): AnchoredVwapApi[];
public addVolumeProfile(options: VolumeProfileOptions = {}): VolumeProfileApi;
public getVolumeProfiles(): VolumeProfileApi[];
```

The historical `WorkspaceDocument` did not contain the following field. The
current field is optional and therefore does not make a valid version-1 legacy
document invalid:

```ts
readonly volumeAnalytics?: WorkspaceVolumeAnalytics;
```

The root package also exports the Phase 9 calculation, option, result, and
workspace types. They are additive root exports; an existing consumer does not
need to import or understand them.

### Structural evidence

The AST diagnostic compares the historical source declarations from the
baseline commit with the current declarations. It found:

- `Chart`: six additive public methods, no removed members, no changed members.
- `WorkspaceDocument`: one additive optional property, no removals or changed
  properties.
- Root exports: 71 additions, no removals or re-export target changes.

The fixture suite independently proves that a method or export removal,
parameter/return change, property type change, optional-to-required change,
required interface property, and overload removal are reported as breaking.

## Workspace compatibility

`WorkspaceDocument.version` remains `1`. A legacy document without
`volumeAnalytics` parses successfully, retains its existing fields, and
serializes deterministically. New documents may contain an ordered list of
profile configurations. Empty lists are valid; duplicate IDs, invalid ranges,
unsupported options, and invalid workspace versions are rejected.

Only user-owned configuration is persisted: profile mode, canonical range,
allocation, bins, value-area percentage, and display settings. Derived bins,
POC/VAH/VAL geometry, caches, and temporary placement state remain runtime
state. Anchored VWAP continues to use the ordinary version-1 indicator entry.

An old consumer that does not know the optional field can continue to consume
legacy documents by omitting the field. It is not assumed to preserve unknown
fields during a read/write cycle; applications that need lossless forwarding
must preserve unknown data in their own storage layer.

## Consumer verification

The public consumer checks cover:

- Root ESM runtime exports and pure Phase 9 calculations.
- Existing candle, indicator, drawing, Datafeed, workspace, and disposal
  contracts through the existing public test suite.
- React SSR importability and rendering through `@openkline/react`.
- Packed local ESM installation through `npm run package:smoke`.
- Distribution file-list and package dry-run checks.
- Chromium browser lifecycle coverage for legacy chart APIs and Phase 9
  analytics; official non-Chromium gates remain separate and open.

## Verification matrix

Results below are recorded from the sequential Phase 9.5 verification run on
Node.js `v24.19.0`, npm `11.9.0`, and Playwright `1.64.1`.

| Command | Result | Evidence / scope |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript core and React checks |
| `npm test` | PASS — 229/229 | Node contract and compatibility fixtures |
| `npm run api:inventory` | PASS — 214 runtime / 480 type | Current public export inventory |
| `npm run api:diagnostics` | PASS — additive review required | Six additive Chart methods, one optional field, 71 additive exports; no structural breaking findings |
| `npm run api:check` | OPEN / expected FAIL | Zero removals; two intentional declaration hash changes; historical baseline approval is not authorized |
| `npm run studio:check` | PASS | 103 core files, 13 Studio files, no React/Next core runtime dependency |
| `npm run package:check` | PASS | 414 files, 389,230-byte package |
| `npm run package:smoke` | PASS | Local packed ESM consumer installed and imported |
| `npm run distribution:check` | PASS | 414 files, 2,224,207 unpacked bytes, SHA-1 `fed5ea1bdfa510f1b90eb9606f919a7b4ae1cf37` |
| `npm run test:browser` | PASS — 27/27 | System Chromium 154.0.8037.57 at `/usr/bin/chromium` |
| `npm run test:react:browser` | PASS — 32/32 | System Chromium 154.0.8037.57; React/Studio workflows |
| `npm --prefix examples/nextjs-app-router run build` | PASS | Next.js 16.4.3 production webpack build |
| `npm run test:browser:compat` | BLOCKED — command exit 1 | 27 mobile-Chromium tests passed; 81 Firefox/WebKit/mobile-Safari tests could not launch because Playwright-managed binaries are absent |

The compatibility command used Playwright-managed paths
`/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` and
`/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`; neither exists in
this cloud environment. The `test:browser` project intentionally uses the
available system Chromium, so its result is Chromium-only evidence. No
unavailable browser result is inferred from it.

## Migration guidance

No migration is required for existing consumers. They may continue to use the
previous Chart methods and version-1 workspace shape. Consumers adopting Phase
9 should:

1. Import the additive calculation or Chart APIs from the documented root
   entrypoint.
2. Treat profile output as an OHLCV estimate, not exchange-reported
   volume-at-price data.
3. Persist only the public options returned by the workspace contract.
4. Parse untrusted workspace input with `parseWorkspace` and handle its
   validation error.
5. Keep their own storage policy for unknown optional fields if lossless
   forwarding is required.

## Required owner decision

The owner must decide whether the documented Phase 9 additions are accepted as
the next public compatibility baseline. The approval packet is:

- Baseline: `3e7a889a94c40255bbcce210a672856cfc98b32b`.
- Current implementation: the verified Phase 9.5 commit recorded above.
- Removals: none.
- Additions: six `Chart` methods, one optional workspace field, and 71 root
  surface entries.
- Runtime evidence: 229 Node tests (after the final run), package/React
  consumer checks, and available Chromium suites.
- Serialization impact: optional `volumeAnalytics`; version remains `1` and
  legacy documents remain valid.
- Proposed decision: approve the additive contract and authorize a separate
  reviewed baseline update, or keep the gate open and defer adoption.

No automated result is treated as legal, licensing, or owner approval.

## Remaining gates

- Historical API baseline approval and deliberate update remain open.
- Playwright-managed Firefox, WebKit, mobile Safari, and physical-device
  verification remain open when their binaries/devices are unavailable.
- Accessibility and visual-baseline approvals remain separate project gates.
- npm publication, release tags, GitHub releases, licensing changes, and
  GitHub Actions remain outside this phase and were not performed.
