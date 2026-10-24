# ADR 003: Capability-based Plugin SDK

## Status

Accepted for Phase 3 implementation.

## Decision

Use a chart-scoped, typed `PluginRegistry` with explicit capabilities for
indicators, drawing tools, controlled overlays, events, commands, and JSON
state. Keep plugin API versioning separate from the package version. Require
trusted in-process plugin modules and do not expose raw chart internals or a
Canvas2D context.

## Consequences

Plugins can be installed, rolled back, restored, and disposed deterministically
without duplicating viewport, scale, or lifecycle logic. Rendering extensions
are bounded and testable. Distribution security, sandboxing, signatures, and
permissions remain application responsibilities. New capabilities require a
deliberate API-version change rather than silently widening the context.
