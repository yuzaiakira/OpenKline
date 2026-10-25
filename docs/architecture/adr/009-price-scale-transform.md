# ADR 009: centralize primary price-scale transforms

## Status

Accepted for Phase 7.0.1.

## Context

Before Phase 7, the renderer, crosshair, drawing converter, and plugin context
each constructed a similar linear scale. Adding log, percentage, and indexed
views to those separate paths would allow tooltip, anchor, and overlay geometry
to disagree.

## Decision

`PriceScale` owns transformations, inverse transformations, formatting, domain
fallback diagnostics, and margins. `Chart` resolves stable primary-scale
configuration and `createPanePriceScale` supplies it to every main-pane
consumer. Non-main panes receive independent linear scales.

Raw values remain the public data contract. Percentage and indexed references
are explicit or derived from the first positive primary close across the full
dataset. Invalid domains deterministically fall back to linear rather than
altering source values or throwing during pointer interaction.

## Consequences

The public API can evolve toward additional scale behavior without breaking raw
data/drawing contracts. The initial scope intentionally does not implement
multi-axis placement, exchange calendars, or secondary price axes.
