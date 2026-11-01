# Phase 16.3 research scenario comparison benchmark

Status: **VERIFIED INTERNAL BENCHMARK — NOT A PUBLIC PERFORMANCE CLAIM**

This benchmark measures the internal sequential comparison executor. It does
not measure chart rendering, Worker throughput, broker behavior, exchange fill
quality, or production capacity. All executions are simulated research
reconstructions.

## Reproducible command and environment

```text
npm run benchmark:research-comparison
```

The command builds the internal source and runs
`node --expose-gc scripts/research-scenario-comparison-benchmark.mjs`.

| Field | Value |
| --- | --- |
| Benchmark commit | `e871213cba57e3759914ff36c9e489fa9c4887e6` |
| Node | `v24.19.0` |
| Platform / architecture | `linux` / `x64` |
| Forced GC | available |
| Tape | deterministic source-status + Level-2 snapshot + unique trade events |
| Scenarios | baseline plus two sequential assumption patches |
| Checkpoints | disabled |
| Scenario limit | 8 total |
| Eligible event-visit limit | 1,000,000 |
| Serialized result limit | 8 MiB |
| Result record / diagnostic limits | 1,000 / 100 |

Each sample builds a fresh tape, creates a baseline artifact with one market
buy, restores the baseline and two candidate variants independently, records
bounded comparison output, releases local references, and requests GC. The
candidate patches change fixed commission and displayed-depth participation.
The baseline artifact carries expected evidence and reconstructs as
`verified`; patched variants intentionally omit source expected evidence, so
their reconstruction status is `no-expected-result`. Consequently the overall
comparison status is `partial` by design and is not reported as verified
exchange evidence.

## Results

Times are milliseconds. Heap values are bytes. Median and p95 use the
nearest-rank ceiling; the 100k workload has two samples, so its p95 is only
the maximum observed sample and is not a stable tail estimate.

| Events | Samples | Comparison median / p95 | Tape build median / p95 | Artifact build median / p95 | Result bytes median / p95 | Retained heap delta median / p95 | Event visits |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 3 | 264.993 / 297.623 | 32.436 / 47.838 | 69.536 / 73.130 | 8,860 / 8,860 | 314,304 / 1,023,664 | 3,000 |
| 10,000 | 3 | 3,037.272 / 3,097.623 | 288.409 / 305.443 | 673.516 / 780.149 | 8,888 / 8,888 | 156,392 / 221,440 | 30,000 |
| 100,000 | 2 | 24,968.951 / 24,968.951 | 3,084.948 / 3,084.948 | 5,356.904 / 5,356.904 | 8,916 / 8,916 | 240,064 / 240,064 | 300,000 |

All three workloads remained below the configured aggregate visit and result
budgets. The benchmark did not run 500,000 events. The heap readings are
process-level retained-delta observations after forced GC and are not a V8
heap guarantee.

## Interpretation

- The comparison path is sequential and uses three fresh causal restorations;
  its cost therefore scales with the number of eligible event visits and the
  number of scenarios.
- Candidate outputs remained bounded at approximately 8.9 KiB for this fixture;
  the increase from the earlier Phase 16.3 result is the documented monetary
  unit provenance and execution-cost delta contract, not an unbounded result
  path. This is a fixture result size, not a general upper bound.
- No ranking is performed. Different decision histories and indeterminate
  valuations remain explicitly classified in the result contract.
- Existing Phase 16.0–16.2 replay benchmarks remain separate historical
  evidence because their workload schemas and measured paths differ.
- Official Firefox, WebKit, Mobile Safari, physical-device, accessibility,
  legal, public API, and release gates are independent of this Node benchmark.
