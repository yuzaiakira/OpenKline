# Contrast Audit — WCAG 2.2 AA — Phase 16.4.8

## Methodology

- Algorithm: WCAG relative luminance with sRGB linearization and
  `(L1 + 0.05) / (L2 + 0.05)`.
- Translucent surfaces: composite onto the nearest opaque ancestor background
  before measuring.
- Thresholds:
  - Text (1.4.3): **4.5:1** normal text; **3:1** large text when applicable.
  - Non-text UI (1.4.11): **3:1** for required control boundaries / focus /
    meaningful graphical indicators against adjacent colors.
- Exceptions respected: inactive/disabled components (1.4.3), pure decoration,
  chart canvas pixel content (assessed via accessible name, not pixel contrast).
- Themes:
  - Studio chrome: **dark shell only** (chart theme may be light/dark; shell CSS
    remains dark).
  - Internal Widget: **dark** and **light** via `data-theme`.

Automated evidence:

- `tests/react-browser/contrast-audit.spec.ts`
- `tests/react-browser/contrast-utils.ts`
- `tests/browser/widget-contrast.spec.ts`
- axe color-contrast enabled on Studio chrome scopes (not canvas)

## Inventory (measured)

| Location | Theme | State | FG | Effective BG | Ratio | Criterion | Threshold | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Studio primary button text | dark | default | `#e7eef9` | `#132138` | 13.82 | 1.4.3 | 4.5 | PASS | Token calc + Playwright |
| Studio muted text | dark | default | `#9eb0c9` | `#111c2f` / `#091323` | 7.72–8.42 | 1.4.3 | 4.5 | PASS | |
| Studio placeholder | dark | default | muted | input bg | ≥4.5 | 1.4.3 | 4.5 | PASS | Playwright sample |
| Studio status `aria-live` | dark | default | muted | `#0b1525` | 8.28 | 1.4.3 | 4.5 | PASS | |
| Object Tree heading | dark | default | `--text` | tree panel | ≥4.5 | 1.4.3 | 4.5 | PASS | Playwright |
| KlineScript line numbers | dark | default | `#8b9cb3` | `#0b1627` | 6.48 | 1.4.3 | 4.5 | PASS | Was `#60728d` @ 3.70 **FAIL**; fixed |
| Studio button border | dark | default | `#53729a` | adjacent panel/button | 3.26–3.76 | 1.4.11 | 3.0 | PASS | |
| Studio focus outline | dark | focus-visible | `#fbbf24` | control bg | ≥9.6 | 1.4.11 | 3.0 | PASS | Also 2.4.7 |
| Studio disabled “Remove chart” | dark | disabled | n/a | n/a | n/a | 1.4.3 | n/a | NOT APPLICABLE | Inactive exception |
| Widget button text | dark/light | default | theme text | theme bg | ≥4.5 | 1.4.3 | 4.5 | PASS | Playwright both themes |
| Widget muted labels | dark/light | default | theme muted | panel | ≥4.5 | 1.4.3 | 4.5 | PASS | |
| Widget control border | dark | default | `#64748b` | `#111827` | 3.73 | 1.4.11 | 3.0 | PASS | Was `#334155` @ 1.71 **FAIL** |
| Widget control border | light | default | `#64748b` | `#ffffff` / `#f8fafc` | 4.55–4.76 | 1.4.11 | 3.0 | PASS | Was `#cbd5e1` @ 1.48 **FAIL** |
| Widget focus outline | dark/light | focus-visible | theme focus | control bg | ≥3 | 1.4.11 | 3.0 | PASS | |
| Widget object-row separator | both | default | border@85% mix | panel | ≥3.05 | 1.4.11 | 3.0 | PASS | Was 65% mix **FAIL** (~2.3) |
| Chart canvas pixels | both | rendered | n/a | n/a | n/a | 1.4.3 | n/a | NOT APPLICABLE | Accessible name on canvas |
| Studio light shell chrome | light | n/a | n/a | n/a | n/a | 1.4.3 | n/a | NOT APPLICABLE | Shell CSS is dark-only |
| Hover/pressed Studio buttons | dark | hover/pressed | text | `#1d3658` | high | 1.4.3 | 4.5 | PASS | Token-derived |
| Full hover matrix every panel | both | hover | — | — | — | 1.4.3/1.4.11 | — | PARTIAL | Representative samples automated; dense panels not exhaustively pixel-sampled |
| Overlay dialogs in light chart theme | mixed | open | — | — | — | 1.4.3 | — | PARTIAL | Dialog uses dark panel tokens |

## Verified failures closed this phase

1. Widget dark border `#334155` on `#111827` → **1.71** (need 3) → `#64748b`.
2. Widget light border `#cbd5e1` on white → **1.48** (need 3) → `#64748b`.
3. Object-row `color-mix(... 65%)` separator → ~**2.3** → **85%** mix.
4. KlineScript line numbers `#60728d` on `#0b1627` → **3.70** (need 4.5) → `#8b9cb3`.

## Focus criteria

| Criterion | Level | Result | Evidence |
| --- | --- | --- | --- |
| 2.4.7 Focus Visible | AA | PASS | `:focus-visible` 2px amber/sky outlines; Playwright |
| 2.4.11 Focus Not Obscured (Minimum) | AA | PARTIAL | Dialogs center-focused; sticky overlay obstruction not exhaustively AT-verified |
| 2.4.13 Focus Appearance | AAA | PASS (enhanced target, not AA obligation) | ≥2px outline with ≥3:1 non-text contrast |

## Residual risk

- Studio shell lacks a dedicated light theme; light chart theme with dark chrome is intentional today.
- Exhaustive hover/error/warning matrices for every Studio panel remain PARTIAL.
- Formal AT confirmation of contrast perception remains NOT TESTED.
