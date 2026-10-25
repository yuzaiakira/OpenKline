# ADR 005: Validated interpreter instead of code generation

Status: accepted for Phase 4 v0.1.

Interpret a frozen AST after lexical, semantic, and type validation. Do not
translate source to JavaScript, use `eval`, `new Function`, or build a JIT.
The interpreter is slower than generated code but gives a small auditable
capability surface and explicit budget/cancellation checks. Performance is to
be measured rather than inferred; a Worker path may be added later without
changing the language contract.

