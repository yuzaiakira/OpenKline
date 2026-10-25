# KlineScript incremental execution

Incremental execution is a separate correctness milestone from Worker
transport. The current Worker `update-input` path is deliberately conservative:
it keeps the ordered candle session in the worker and accepts appends and
corrections. A verified `pointwise-append` subset can append one point; all
other programs use the same full interpreter as `execute`.

## Current implementation

The compiler classifies scripts with no assignments, input parameters,
historical indexing, or technical-function calls whose plot/hline expressions
contain only candle fields, literals, arithmetic, comparisons, boolean
operators, and conditionals. The Worker retains the previous result and
evaluates the new candle for this subset. Its finite-number, null-propagation,
and division semantics match the reference interpreter.

SMA, EMA, RSI, MACD, ATR, standard deviation, highest/lowest, parameterized
scripts, historical indexing, and corrections conservatively use full
reference execution. This is a verified subset, not a general constant-time
claim.

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
                              -> differential comparison in verification
                         equal? publish candidate : publish reference
```

The deterministic differential suite compares every supported pointwise output
against a fresh full execution across randomized prefixes, missing volume,
multiple outputs, and hline values. It also verifies that unsupported scripts
are classified for fallback and that corrections use the full path. The
`operations` field is execution-work measurement and may differ between a
candidate and a full run; values, timestamps, nulls, ordering, identifiers,
and parameters must match exactly. No public O(1) promise is made by the
current runtime. The existing native indicator engine keeps its established
append optimizations; KlineScript must not weaken their financial-data
correctness.

## Invalidating events

- same-timestamp update: recompute from the affected dependency boundary;
- historical insertion or correction: invalidate dependent history;
- source or compiler-option change: discard the compiled/session state;
- parameter change: discard state unless the dependency analysis proves the
  parameter is not used;
- replay seek: use the replay-visible prefix and do not reuse future state;
- Worker restart: restore the snapshot/session before publishing a result.

The Worker benchmark and tests are the evidence for the current subset. A
broader retained-state path for SMA/EMA/RSI/MACD/ATR/window functions requires
new numerical equivalence tests and measured memory/latency evidence before it
can replace this fallback policy.
