# ADR 004: KlineScript v0.1 grammar

Status: accepted for Phase 4 v0.1.

Use a Python-inspired, line-separated expression language with assignments,
fixed declaration/plot calls, precedence-aware expressions, and no blocks,
loops, recursion, imports, or user functions. This keeps parser recovery and
resource analysis deterministic while leaving room for a future explicitly
bounded language extension. See `docs/klinescript/grammar.md`.

