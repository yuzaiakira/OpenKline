# Accessibility State Matrix — Phase 16.4.9

Scope: Studio (multi-chart Next app) + internal Widget surfaces that ship with OpenKline.

Method: inventory from implementation + deterministic Playwright measurement where marked **A**; token calculation **T**; keyboard **K**.

Result: PASS / FAIL / PARTIAL / NOT TESTED / NOT APPLICABLE.

## Component inventory

| Component | Location | Supported states | Contrast | Semantics | Evidence |
| --- | --- | --- | --- | --- | --- |
| Studio toolbar chart-type buttons | `multi-chart-studio-client.tsx` + `studio.module.css` | default, hover, focus-visible, aria-pressed | PASS (A) | PASS (`aria-pressed`) | `contrast-audit`, `state-matrix-negative` |
| Drawing tools | toolbar | default, hover, focus, disabled (replay) | PASS (T/A hover) | PASS names | prior a11y + disabled exception |
| Object Tree Hide/Show | Object Tree | default, focus, keyboard activate, visible/hidden attrs | PASS | PASS name flip | `accessibility`, `state-matrix-negative` |
| Object Tree Lock/Unlock | Object Tree | default, focus, locked attr | PASS | PASS name flip | same |
| Object Tree Select | Object Tree | default, click select | PASS | PASS name | `state-matrix-negative` |
| Watchlist Rename dialog | dialog | open, focus trap, cancel, apply, invalid | PASS alert contrast | PASS aria-invalid + alert | `state-matrix-negative` (new) |
| Watchlist Delete confirm | dialog | open, confirm/cancel | PASS | PASS | prior dialog a11y |
| Theme select (chart) | Active chart settings | default, change | N/A shell | PASS labelled | Studio remains dark chrome |
| Sync checkboxes | Active chart | checked/unchecked, focus | PASS | PASS names | prior |
| Strategy tabs | Strategy tester/optimizer | aria-selected | PASS | PASS tablist/tab | prior 16.4.6 |
| Strategy error | optimizer/tester | error visible | PASS (T #fda4af) | PASS `role=alert` | token + dialog alert reuse |
| Paper trading warning | paper panel | warning text | PASS (T) | visible text | token calc |
| Widget toolbar buttons | `src/widget/styles.ts` | default, hover, focus, disabled, light/dark | PASS | PASS | `widget-contrast` |
| Widget error/empty | widget status | error color | PASS (T danger) | `data-openkline-error` | token |
| Widget object-row separators | widget | default | PASS (85% mix) | n/a | 16.4.8 fix |
| KlineScript line numbers | editor | default | PASS | aria-hidden decorative but sighted contrast fixed | contrast-audit |
| Remove chart | settings | disabled (single panel) | N/A 1.4.3 | disabled | contrast-audit |
| Cancel optimization | optimizer | disabled when idle | N/A 1.4.3 | disabled | state-matrix-negative |
| Canvas chart | multi-chart | focusable img | N/A pixel contrast | PASS aria-label | accessibility |
| Mobile/responsive chrome | CSS ≤360/720 | reflow | PASS | controls reachable | reflow tests |

## Previously incomplete states (Phase 16.4.8)

| State | Result this phase |
| --- | --- |
| Hover toolbar | PASS measured |
| aria-pressed / selected toolbar | PASS measured |
| Error/validation dialog | PASS measured + semantics fix |
| Disabled applicability | NOT APPLICABLE documented with live disabled controls |
| Focus not obscured @360px dialog | PASS geometry check |
| Exhaustive every-panel hover | PARTIAL — representative toolbar/Object Tree/dialog covered; dense secondary panels rely on shared tokens |

## Shared-token rationale

Studio hover/pressed reuse `#1d3658` background + `--text` / `--accent` borders already ≥ AA thresholds. Widget light/dark borders remain `#64748b` from Phase 16.4.8.
