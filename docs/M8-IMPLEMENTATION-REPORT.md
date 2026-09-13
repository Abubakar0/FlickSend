# M8 Implementation Report

## Status

M8 TRANSFER HEALTH / SPEEDPROOF: COMPLETE

M8 FINAL QUALIFICATION: PASS

M8 FINAL VERIFICATION: PASS

M8 is a bounded diagnostics observer. It does not change FSTP v4/v5 framing, logical block or
frame sizing, receiver-authoritative recovery, integrity retries, destination finalization, route
selection, or the conditions for `DELIVERED`.

## Delivered

- `@flicksend/transfer-health` remains pure TypeScript: no React, Next.js, WebRTC, filesystem,
  authentication, database, UI, filename, path, or payload dependency.
- `engine-core` samples safe aggregate M5/M6 measurements and selected-pair diagnostics only.
  Its history stays bounded to 120 samples, 64 events, and 16 route segments.
- Source and destination B/s now measure the elapsed time of each bounded local adapter operation.
  They are labelled as **work rates** in Engine Lab and documentation, never as physical disk, OPFS,
  or internet throughput.
- Pause and route replacement restart only short-window inference warmup. Whole-transfer counters,
  stable transfer identity, and route history remain intact. During pause or recovery, bottleneck,
  stall, and ETA claims are suppressed.
- Terminal SpeedProof preserves the last evidence-backed limit. `NONE_DETECTED` no longer erases a
  prior supported diagnosis merely because the transfer later has insufficient active evidence.

## Qualification Evidence

Fresh M8 evidence is under [`benchmarks/results/2026-09-08`](../benchmarks/results/2026-09-08).
The qualification runner names evidence using its UTC run date; this local September 9 closeout
therefore retains its raw M8 and real coturn M7 route sequence together under that directory.

| Scenario                  | Result                                                                                                                                                                             | Evidence                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Real M5 paced source      | PASS: 600 ms bounded source-read pacing; source limit, root, exact fixture, and `DELIVERED`                                                                                        | `m8-paced-source-limit.json`                     |
| Real M5 paced destination | PASS: 10 ms per 64 KiB destination pacing; 8,257,536-byte observed queue peak, destination limit, root, exact fixture, and `DELIVERED`                                             | `m8-paced-destination-limit.json`                |
| Real M5 paced transport   | PASS: 8 ms frame backpressure wait; 524,288-byte sender pressure, local work headroom, network limit, root, exact fixture, and `DELIVERED`                                         | `m8-paced-network-limit.json`                    |
| Ambiguous measurements    | PASS: unavailable local fields remain `INSUFFICIENT_DATA`; no limit is invented                                                                                                    | `m8-unknown-bottleneck.json`                     |
| Browser M5 observer       | PASS: 16 MiB direct M5 WebRTC delivery with safe health fields and SpeedProof                                                                                                      | `m8-browser-m5-health-work-rate-v2.json`         |
| Observer disabled         | PASS: the same verified browser M5 pipeline completes with health and SpeedProof absent                                                                                            | `m8-browser-observer-off-work-rate-v2.json`      |
| Pause suppression         | PASS: analyzer unit proof asserts `PAUSED`, no stall, no bottleneck, null ETA, then new warmup after resume                                                                        | `packages/transfer-health/test/analyzer.test.ts` |
| Direct to relay           | PASS: 40 MiB real M5 run retained an 8 MiB verified checkpoint, kept its ID, entered `RECOVERING`, reset relay warmup, reached an active relay state, verified root, and delivered | `m8-direct-to-turn-route-health.json`            |

The paced tests aggregate actual snapshots from locally paired M5 sender and receiver engines. They
do not supply hand-authored aggregate rates to the analyzer. Their pacing adapters are deterministic
test infrastructure, so this qualifies health inference behavior, not physical storage, network,
CPU, memory, browser, or production performance.

The direct-to-relay record shows `DIRECT -> RECOVERING -> RELAY STARTING -> RELAY DEGRADED`, a
stable transfer ID, 8 MiB safe verified progress before interruption, and final root verification.
Its warmup snapshot observed `RELAY_TCP` and its later active snapshot observed `RELAY_UDP`; this is
not independent TURN/TCP qualification because no scenario forced TCP alone or proved payload
delivery exclusively over TCP. The final M7 selected relay route is UDP. TURN-to-direct reacquisition
also remains unqualified because M7's `directReacquired` result is false.

## Metric Semantics And Legacy Evidence

The earlier report's `8,388,608,000 B/s` source value was derived from inter-operation event timing.
It described a short bounded browser source-read burst, never physical disk speed. The old generic
browser evidence filename has been retired: all new browser work-rate records use
`M8_WORK_RATE_V2` and `-work-rate-v2.json` names so a future measurement-semantics change cannot
reuse the same evidence name.

The pre-closeout generic filename was reused before this immutable naming rule was added. Its original
raw bytes cannot be reconstructed faithfully, so this report retains the historical value as
deprecated report metadata rather than silently relabeling it or treating it as current evidence.
The schema-v2 artifacts above are the active M8 browser evidence. The historical
`m8-controlled-inference.json` remains deterministic classifier-only evidence and is not used to
qualify the three paced M5 cases.

## Verification

| Command                 | Actual result                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | PASS: 20 Turbo tasks on Node 24.19.0                                                        |
| `pnpm lint`             | PASS: 11 Turbo tasks                                                                        |
| `pnpm test`             | PASS: 116 unit tests across 19 Turbo tasks                                                  |
| `pnpm test:e2e`         | PASS: 15 Chromium tests; 15 explicitly gated tests skipped                                  |
| `pnpm build`            | PASS: 11 Turbo tasks; Engine Lab production build succeeded                                 |
| `pnpm format:check`     | PASS                                                                                        |
| `pnpm qualification:m8` | PASS: browser M5 plus all required real-engine paced and insufficient-data records          |
| `pnpm qualification:m7` | PASS: 10/10 real local Chromium/coturn scenarios; dedicated M8 route-health record retained |

The standard E2E skips are intentional: ten M7 coturn tests require `pnpm qualification:m7` to
provision temporary coturn credentials and service, while five M2/M4B/M5 large-fixture cases require
explicit local 1 GiB or 10 GiB fixtures. They are not silently counted as M8 qualification.

## Deferred

- M3 physical performance qualification: DEFERRED
- M4 10 GiB long-run qualification: environmental timeout / deferred evidence
- M9 compatibility matrix: NOT STARTED
- M10 physical qualification: NOT STARTED
- Production TURN deployment: DEFERRED
- Application-layer payload encryption: NOT STARTED
- Offline delivery, Mesh, and Turbo: NOT STARTED

M9 has not started.
