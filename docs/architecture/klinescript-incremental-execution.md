# KlineScript incremental execution

Incremental execution is a separate correctness milestone from Worker
transport. The current Worker `update-input` path is deliberately conservative:
it keeps the ordered candle session in the worker, accepts appends and
corrections, then runs the same full interpreter used by `execute`.

## Required equivalence

An incremental implementation may publish a result only when it is equivalent
to a fresh execution over the same ordered candle snapshot. Equivalence covers
all output points, missing values, output ordering, styles, timestamps,
operation accounting, diagnostics, and parameter changes. Historical
corrections, developing-bar replacements, out-of-order inserts, and a changed
source must invalidate any reusable state that cannot be proven correct.

```text
event -> ordered CandleStore -> incremental candidate
                         \-> full reference execution
                              -> differential comparison
                         equal? publish candidate : publish reference
```

The differential path is a development and verification contract. It must use
deterministic fixtures and adversarial cases for warm-up, duplicate timestamps,
missing values, lookback windows, multi-output scripts, and parameter changes.
No public O(1) promise is made by the current runtime. The existing native
indicator engine keeps its established append optimizations; KlineScript must
not weaken their financial-data correctness.

## Invalidating events

- same-timestamp update: recompute from the affected dependency boundary;
- historical insertion or correction: invalidate dependent history;
- source or compiler-option change: discard the compiled/session state;
- parameter change: discard state unless the dependency analysis proves the
  parameter is not used;
- replay seek: use the replay-visible prefix and do not reuse future state;
- Worker restart: restore the snapshot/session before publishing a result.

The first production implementation therefore uses full reference execution
after each accepted update. A later optimization must add measured benchmark
evidence, differential tests, and a safe fallback before changing this rule.
