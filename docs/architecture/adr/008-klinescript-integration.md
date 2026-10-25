# ADR 008: KlineScript integration boundary

Status: accepted for Phase 4 v0.1.

Expose a compiled program and `Chart.addScriptIndicator`, then reuse
`IndicatorRegistry`, `IndicatorDefinition`, pane layout, series styles, and
workspace validation. KlineScript never receives CandleStore, PointStore,
renderer state, or plugin closures. Workspace state stores only a validated
source reference and JSON input/style values.

