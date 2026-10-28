# Phase 8.8.18 Next Actions

Audited source: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Automated managed-browser gate: **PASS** (do not re-open without a new source SHA).

## Priority order

### P0 — Owner / legal (blocks any publication)

1. Complete ownership, provenance, and counsel review for the custom
   source-available proposal (`docs/legal/*`, `docs/release/owner-approval.md`).
2. Decide effective license text, patent/trademark position, and package
   `license` metadata **after** written approval only.
3. Resolve third-party notice obligations for redistributed examples
   (especially Next.js example CC-BY / LGPL-related metadata if in scope).
4. Record explicit release authorization (version, channel, what may be
   published). Until then: no npm publish, tags, GitHub Releases, or visibility
   changes.

### P0 — Hardware (blocks physical-device claims)

5. Connect an authorized Android device; run the physical touch/drawing/dialog
   checklist; keep results private/local.
6. Provide native iOS Safari access (real device) or keep the gate **BLOCKED**.

### P1 — Human review

7. Owner/reviewer inspect local visual candidates
   (`studio-dark` / `studio-light` / `studio-mobile`) and either approve a
   baseline set with engine/viewport/font provenance or reject with notes.
8. Conduct screen-reader review with a real AT (Orca on Linux, or NVDA/JAWS/
   VoiceOver elsewhere) and retain observations.
9. Expand manual keyboard coverage beyond smoke to alerts, paper trading,
   backtest, optimization, and replay workflows.

### P2 — Engineering hygiene (optional; no PASS theater)

10. Decide whether to add axe-core (or similar) as an explicit optional audit
    tool without implying conformance.
11. Optionally generate managed Firefox/WebKit visual candidates in the
    official Playwright container for owner comparison (still not approval).

## Recommended next engineering phase

**Phase 8.8.19 — Owner decision packet and physical-device preparation**

- Produce a single owner checklist linking license, visual, a11y, and device
  gates.
- Do **not** change chart/drawing/product APIs unless a concrete FAIL from
  owner/hardware review requires a new source SHA and renewed relevant
  verification.
- Keep `bb3f1ca` as the last automated five-browser PASS baseline until a
  behavioral change lands.

## Explicit non-actions

- Do not publish OpenKline.
- Do not activate LICENSE/NOTICE from this audit.
- Do not treat Phase 8.8.17 200/200 as release readiness.
- Do not claim physical Android or native iOS Safari from emulation.
