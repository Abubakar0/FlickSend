# Benchmark Runner

## M6 folder fixtures

The folder fixture command accepts structural, tiny-many, mixed, and large presets. It creates
deterministic bounded-memory files beneath benchmarks/fixtures, which remains Git-ignored.

M3 uses the Engine Lab to execute a selected configuration and download a privacy-minimized JSON
measurement report. It contains configuration and metrics, never a source filename, path, or bytes.

Create a reproducible plan before a manual run:

```powershell
node benchmarks/runner/m3-plan.mjs --dataset=zero-10g --size-gib=10 --frame-kib=64 --low-mib=2 --high-mib=8
```

Compare downloaded reports after copying them into `benchmarks/results/<date>/`:

```powershell
node benchmarks/runner/m3-compare.mjs benchmarks/results
```

Plans are not results. Benchmark qualification must run on controlled physical machines, not shared
CI runners.

## M10 physical qualification

`pnpm qualification:m10` is only a same-host tooling preflight. It intentionally does not claim
network performance. Use the two-machine procedure in [Physical Performance Qualification](../../docs/PERFORMANCE-QUALIFICATION.md)
to collect sender/receiver inventory, bidirectional `iperf3` TCP baseline, disk baselines, bounded
browser-process samples, and sanitised direct-transfer evidence. Artifacts are immutable and must be
written below `benchmarks/results/<date>/`; peer addresses, paths, host identifiers, and transfer IDs
are never retained.
