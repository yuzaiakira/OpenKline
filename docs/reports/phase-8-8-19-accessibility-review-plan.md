# Phase 8.8.19 Accessibility Review Plan

Status: **Plan ready; formal review NOT TESTED**  
Product baseline: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
WCAG 2.2 AA is a **proposed technical reference only** until the owner adopts a target.

Automated smoke (Phase 8.8.18): PASS for names, dialogs, focus trap, contrast
samples, reduced-motion path. Assisted keyboard smoke: PASS-smoke.  
axe-core: NOT TESTED (not a dependency).  
Screen reader: **NOT TESTED** — `orca` not available on the audit host.

Do not claim formal WCAG certification from automation.

## Screen-reader availability (this host)

| Check | Result |
| --- | --- |
| `orca` on PATH | Not found |
| Pacman package query | Not installed |
| NVDA / JAWS / VoiceOver | Not available on Manjaro Linux host |

If the owner authorizes AT setup later, prefer a dedicated checklist session;
do not install large desktop packages in this phase without explicit approval.

Offline-oriented Orca note (authorization required before install):

```bash
# Example only — do not run without owner approval
# sudo pacman -S orca espeak-ng
# Enable Accessibility in desktop settings; restart session; launch Orca
```

## Manual review cases

Record for each case: date, reviewer, browser, AT (if any), PASS / FAIL /
BLOCKED / NOT TESTED, notes. Initial status for all: **NOT TESTED**.

### 1. Keyboard-only navigation

1. Load Studio at a desktop viewport.
2. Using only Tab / Shift+Tab / Enter / Space / Escape / arrows where native:
   reach layout, symbol, timeframe, workspace actions, chart tools, watchlist,
   indicators, alerts, replay, screener, optimizer, tester, paper trading.
3. Confirm no keyboard trap outside intentional modal traps.
4. Confirm a visible focus indicator on each stop.

### 2. Canvas focus and keyboard operation

1. Tab to the chart canvas (`role="img"`).
2. Verify `aria-label` summarizes visible bars / series / panes (or empty state).
3. Note which chart interactions are keyboard-operable vs pointer-only.
4. Record any unreachable drawing/zoom actions as limitations (not silent PASS).

### 3. Dialog focus and restoration

1. Open Rename watchlist (and one confirm dialog) via keyboard.
2. Confirm initial focus lands in the dialog (prompt → Dialog value).
3. Tab / Shift+Tab cycle stays inside; Escape closes; focus returns to trigger.
4. Cross-check with automated dialog tests; still require human observation.

### 4. Alerts and notifications

1. Create, pause, remove an alert with keyboard where possible.
2. Verify live region / status text announces success and errors.
3. With AT (when available): listen for polite/assertive updates.

### 5. Form validation

1. Submit invalid alert / paper / workspace name inputs.
2. Confirm errors are associated with fields and announced.

### 6. Watchlists

1. Search, select, rename, delete, favorite/unfavorite via keyboard.
2. Confirm list updates are perceivable without pointer hover alone.

### 7. Indicator controls

1. Add/remove SMA and RSI (or equivalents) via labeled controls.
2. Confirm pane changes reflected in canvas summary / UI text.

### 8. Drawings

1. Activate a trend tool via keyboard if possible; otherwise document pointer
   requirement as a known limitation.
2. Place anchors (pointer allowed for this case if keyboard activation exists).
3. Verify drawing list count and selection text update.

### 9. Paper Trading

1. Reach order ticket; submit simulated buy/sell.
2. Confirm SIMULATED labeling remains visible.
3. Verify order/position audit text updates.

### 10. Strategy Tester

1. Run and cancel a backtest with keyboard-focusable controls.
2. Confirm progress/status and result summary are available as text.

### 11. Replay

1. Enter replay, play/pause, step, exit.
2. Confirm controls are labeled and status is textual.

### 12. Screener and optimization

1. Run a scan / start optimization / cancel.
2. Confirm results tables expose headers/names; status updates are available.

### 13. Contrast

1. Spot-check primary text, muted text, borders, focus ring against Phase 8.8
   measured ratios (`docs/release/accessibility-audit.md`).
2. Note any new themes or states not in the measured sample set.

### 14. Zoom and reflow

1. Browser zoom 200% and narrow viewport (~390px).
2. Confirm no loss of essential controls; scroll instead of trapping content.

### 15. Reduced motion

1. Enable `prefers-reduced-motion: reduce`.
2. Confirm no decorative animation path (automation already checks); observe
   live data/replay still updates.

### 16. Accessible chart data alternatives

1. Read canvas `aria-label` empty and populated states.
2. Decide whether owner requires a data-table alternative for public claims.

## Owner decisions

| Decision | Options | Status |
| --- | --- | --- |
| Conformance target | None disclosed / WCAG 2.2 AA / other | REQUIRES OWNER APPROVAL |
| AT lab | Orca on Manjaro / external NVDA-JAWS-VoiceOver / defer | REQUIRES OWNER APPROVAL |
| Public a11y claims | Disallowed until formal review | Default: no claim |

## Related evidence

- `docs/release/accessibility-audit.md`
- `docs/reports/phase-8-8-18-release-audit.md`
- `tests/react-browser/accessibility.spec.ts`
- `tests/react-browser/contrast-audit.spec.ts`
