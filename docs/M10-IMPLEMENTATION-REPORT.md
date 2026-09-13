# M10 Implementation Report

## Status

```text
M10 AVAILABLE-HARDWARE QUALIFICATION: COMPLETE
M10 ROADMAP CLOSEOUT: PASS WITH DEFERRED PHYSICAL NETWORK EVIDENCE
M10 TWO-MACHINE PHYSICAL NETWORK QUALIFICATION: DEFERRED / ACCEPTED PRODUCT RISK
M10 REPOSITORY VERIFICATION: PASS
```

## Acceptance-Boundary Decision

Only one authorized physical Windows machine was available. No LAN discovery was performed, and no VM,
container, WSL instance, loopback address, second tab, or second browser profile was counted as a
second machine. The result is `SINGLE_MACHINE_ONLY` and follows approved M10 Path B.

Same-host browser runs prove bounded-engine lifecycle, integrity, resume, StreamPack, Health, and
SpeedProof behavior on this hardware. They do not prove physical network throughput, utilization,
cross-machine resilience, or physical TURN performance.

## Available Environment

The privacy-safe preflight records Windows 10 Pro `10.0.19045`, Chrome `152.0.7977.83`, an Intel
Core i7-9850H (6 physical / 12 logical cores), 34,157,072,384 bytes RAM, healthy NVMe SSD storage,
and Wi-Fi inventory with a nominal 433.3 Mbit/s link. The nominal link value is inventory only.
There was no authorized second machine and no local `iperf3` executable.

The 10 GiB runs used two clean persistent Chrome profiles on `D:` so Chrome could persist a complete
benchmark destination. This is qualification-only storage; it is removed after each byte-matched
run and is not a product fallback.

## Disk Baselines

| Measurement                  | Fixture | Duration | Average rate | Cache state             |
| ---------------------------- | ------: | -------: | -----------: | ----------------------- |
| Sequential source read       |  10 GiB | 20.947 s | 488.85 MiB/s | `UNKNOWN_LIKELY_CACHED` |
| Sequential destination write |  10 GiB | 29.728 s | 344.46 MiB/s | `UNKNOWN_LIKELY_CACHED` |

Both use bounded 8 MiB Node.js operations and SHA-256 verification. The fixture is below host RAM,
so these are real local disk observations, not sustained-storage claims.

## Direct Fixtures

| Case                         | Result |    Duration | Harness average | Integrity and destination                                |
| ---------------------------- | ------ | ----------: | --------------: | -------------------------------------------------------- |
| Direct 1 GiB, Health on      | PASS   |   107.114 s |      9.56 MiB/s | 128 verified blocks; receiver root and byte match pass   |
| Direct 10 GiB, Health on     | PASS   | 1,241.808 s |      8.25 MiB/s | 1,280 verified blocks; receiver root and byte match pass |
| Direct 10 GiB, Health off    | PASS   | 1,116.034 s |      9.18 MiB/s | 1,280 verified blocks; receiver root and byte match pass |
| Direct 10 GiB, resume at 50% | PASS   | 1,205.531 s |      8.49 MiB/s | 1,280 verified blocks; receiver root and byte match pass |

All rows used `DIRECT`, reached `DELIVERED` on both peers, recorded zero integrity retries and
mismatches, zero duplicate payload, and zero receiver-committed block retransmission. These rates
are same-host application measurements, not LAN throughput claims.

## Memory And CPU

External Chrome process-tree samples were retained throughout each complete browser run at a five
second interval. The sampler covers both peer contexts and Chrome helper processes on this one host;
it is not a per-machine or two-PC CPU result.

| Fixture            | Initial / average / peak / final memory   | Average / peak CPU | Trend            |
| ------------------ | ----------------------------------------- | ------------------ | ---------------- |
| 1 GiB, Health on   | 1,031.9 / 1,694.4 / 2,310.4 / 2,191.6 MiB | 21.69% / 28.22%    | `NO_CLEAR_TREND` |
| 10 GiB, Health on  | 1,715.2 / 1,882.0 / 2,545.0 / 2,281.5 MiB | 23.74% / 30.23%    | `NO_CLEAR_TREND` |
| 10 GiB, Health off | 1,686.9 / 1,820.4 / 2,379.7 / 1,965.1 MiB | 23.42% / 30.17%    | `NO_CLEAR_TREND` |
| 10 GiB, resume     | 1,728.6 / 1,903.3 / 2,429.6 / 1,934.9 MiB | 24.45% / 30.77%    | `NO_CLEAR_TREND` |

The 1 GiB and 10 GiB peaks are comparable rather than proportional to fixture size. This is
available-hardware bounded-memory evidence only; different profile topology and Chrome internals
mean it is not a universal memory bound.

## Integrity And Resume

The 10 GiB interruption occurred after 5,368,709,120 receiver-committed bytes. Recovery kept the
same transfer identity and reported:

| Metric                             |  Result |
| ---------------------------------- | ------: |
| Safe bytes before disconnect       |   5 GiB |
| Remaining bytes at resume          |   5 GiB |
| Resumed payload bytes              |   5 GiB |
| Ambiguous in-flight retransmission | 0 bytes |
| Duplicate retransmission           | 0 bytes |
| Committed blocks retransmitted     |       0 |
| Reconnect count                    |       1 |
| Recovery reconciliation            |  0.1 ms |

```text
M4 10 GiB long-run resume evidence:
CLOSED FOR SAME-HOST CORRECTNESS QUALIFICATION
```

This does not qualify cross-machine physical networking. Multi-interruption is preferred but was not
rerun because existing M4 multi-interruption browser evidence remains valid and M10 production code
did not change.

## StreamPack

The same-host StreamPack stress result passed with 10,000 files, 103 directories, an approximately
48 MiB mixed fixture, both peers delivered, both FSPK roots verified, and an exact destination tree
match. It completed in 460.813 seconds. Aggregate Chrome process-tree peak memory was 1,448.3 MiB
and average CPU was 13.84%. The run used the existing M6 bounded OPFS writer path; it does not close
M9 real Windows picker evidence.

## Transfer Health, SpeedProof, And Observer Overhead

SpeedProof was internally consistent with its transfer-only duration: 10 GiB Health-on reported
9.44 MiB/s over 1,084.127 s, while the harness wall duration was 1,241.808 s and included setup and
terminal byte verification. The resume record reported one reconnect, two stalls, 17.860 s stalled,
and zero integrity retries, consistent with its controlled recovery scenario.

Transfer Health stayed conservative: available bitrate and destination-write rate remained
`UNAVAILABLE` where the browser did not expose them, and the bottleneck result was
`INSUFFICIENT_DATA`. The bounded local source-read observation is consistent with the
cache-qualified disk baseline; no network bottleneck is claimed.

Health-on and Health-off are both real 10 GiB runs. The Health-on wall duration was 125.774 s longer
(11.27%) on this host. This is an environment-specific observation from one run per condition, not a
causal or universal observer-overhead claim.

## M3 And Two-Machine Status

```text
M3 physical disk evidence: PARTIALLY CLOSED
M3 same-host CPU/RAM/long-run evidence: PARTIALLY CLOSED
M3 two-machine physical network throughput: DEFERRED
M3 physical network utilization: DEFERRED

M10 TWO-MACHINE PHYSICAL NETWORK QUALIFICATION:
DEFERRED / ACCEPTED PRODUCT RISK
```

No physical `iperf3` baseline exists. Every Path B transfer artifact sets
`physicalNetworkUtilization` to `null`; nominal Wi-Fi speed, browser bitrate estimates, and same-host
WebRTC rates were not used as substitutes.

## Evidence Artifacts

- [Environment preflight](../benchmarks/results/2026-09-09/m10-environment-local-precheck-20260909215834633.json)
- [Preflight status](../benchmarks/results/2026-09-09/m10-preflight-20260909215834641.json)
- [10 GiB disk read](../benchmarks/results/2026-09-09/m10-disk-baseline-20260909221933497.json)
- [10 GiB disk write](../benchmarks/results/2026-09-09/m10-disk-baseline-20260909222113820.json)
- [1 GiB direct](../benchmarks/results/2026-09-09/m10-same-host-1_gib-normal-health-on-20260909222647289.json)
- [10 GiB direct, Health on](../benchmarks/results/2026-09-10/m10-same-host-10_gib-normal-health-on-20260910073612069.json)
- [10 GiB direct, Health off](../benchmarks/results/2026-09-10/m10-same-host-10_gib-normal-health-off-20260910080333958.json)
- [10 GiB resume, Health on](../benchmarks/results/2026-09-10/m10-same-host-10_gib-resume-health-on-20260910082640080.json)
- [10,000-file StreamPack stress](../benchmarks/results/2026-09-10/m10-same-host-streampack-10k-20260910084428481.json)

## Repository Verification

Final closeout verification was run after the M10 documentation updates with Node.js 24.19.0.

| Command                  | Actual result                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`         | PASS - 23/23 Turbo tasks succeeded.                                                                                                                                      |
| `pnpm lint`              | PASS - all 13 workspace package lint tasks succeeded with zero warnings permitted.                                                                                       |
| `pnpm test`              | PASS - 22/22 Turbo tasks succeeded; 125 Vitest assertions passed. This includes M4 recovery, M5 integrity failure, M6 StreamPack, M8 health, and M10 validator coverage. |
| `pnpm test:e2e`          | PASS - Playwright final status `passed`, with 16 executed tests and 18 explicit environment-gated qualification tests skipped from 34 planned cases. No test failed.     |
| `pnpm build`             | PASS - 13/13 Turbo tasks succeeded, including the Engine Lab production build and signaling dry-run build.                                                               |
| `pnpm qualification:m10` | PASS - build and local privacy-safe preflight completed; it correctly retained `SINGLE_MACHINE_ONLY` evidence and did not claim physical network qualification.          |

The 18 skipped browser tests require opt-in fixture, physical M10, local coturn, or target-browser
environment variables. They are outside the default regression command's active scope; their retained
qualification evidence remains linked above. The browser suite itself retains M5 deterministic
corruption, permanent-integrity-failure, and manifest-root-mismatch coverage, so the default pass does
not weaken the existing delivery-integrity gate.

## Deferred Risks

- Two-machine physical network qualification and `iperf3` utilization: `DEFERRED / ACCEPTED PRODUCT RISK`
- Physical TURN throughput, direct-to-TURN physical recovery, TURN/TCP, and TURN/TLS: `DEFERRED`
- 25 GiB: `DEFERRED - storage/environment limitation`
- 75/100 GiB endurance: `DEFERRED`
- M9 real external Windows filesystem/picker: `DEFERRED / ACCEPTED PRODUCT RISK`
- macOS and mobile compatibility: `DEFERRED`
- Production TURN deployment, application-layer encryption, offline delivery, Mesh, and Turbo: `NOT STARTED`

```text
CORE ENGINE ROADMAP M0-M10: CLOSED FOR PRODUCTIZATION
STRONG PHYSICAL NETWORK PERFORMANCE CLAIMS: BLOCKED UNTIL TWO-MACHINE QUALIFICATION
```

P1 and M11 have not started.
