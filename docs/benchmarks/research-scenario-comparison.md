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
| Benchmark commit | `1cdec710f707767860b950439e0cafd365e28b7c` |
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
| 1,000 | 3 | 272.271 / 289.417 | 29.668 / 48.681 | 58.909 / 66.013 | 7,827 / 7,827 | 336,320 / 1,021,416 | 3,000 |
| 10,000 | 3 | 2,927.730 / 2,944.946 | 279.082 / 281.640 | 651.594 / 669.865 | 7,855 / 7,855 | 165,432 / 228,832 | 30,000 |
| 100,000 | 2 | 24,113.630 / 24,113.630 | 2,658.565 / 2,658.565 | 5,038.836 / 5,038.836 | 7,883 / 7,883 | 182,200 / 182,200 | 300,000 |

All three workloads remained below the configured aggregate visit and result
budgets. The benchmark did not run 500,000 events. The heap readings are
process-level retained-delta observations after forced GC and are not a V8
heap guarantee.

## Interpretation

- The comparison path is sequential and uses three fresh causal restorations;
  its cost therefore scales with the number of eligible event visits and the
  number of scenarios.
- Candidate outputs remained bounded at approximately 7.6 KiB for this fixture;
  this is a fixture result size, not a general upper bound.
- No ranking is performed. Different decision histories and indeterminate
  valuations remain explicitly classified in the result contract.
- Existing Phase 16.0–16.2 replay benchmarks remain separate historical
  evidence because their workload schemas and measured paths differ.
- Official Firefox, WebKit, Mobile Safari, physical-device, accessibility,
  legal, public API, and release gates are independent of this Node benchmark.
