# M3 Implementation Report

## Architecture Changes

- Source reads use a centrally configured, byte-bounded ordered read-ahead window.
- The sender uses event-driven DataChannel high/low-water scheduling.
- The receiver owns a bounded queued-plus-in-flight write window and acknowledges successfully
  written bytes through FSTP v2 `TRANSFER_FLOW_CONTROL`.
- Receiver writes use original decoded frame views where possible and bounded coalesced batches only
  when needed.
- The engine publishes snapshots at a configured interval while retaining internal frame-level
  measurement. The Engine Lab renders only snapshots.
- M3 remains main-thread WebRTC with one reliable ordered bulk channel. Worker placement and
  multiple-channel experiments are deliberately unselected pending physical evidence.

## Buffer Ownership

```text
File.slice().arrayBuffer() [bounded source allocation]
  -> Uint8Array view [no copy]
  -> frame ArrayBuffer [one header + payload copy]
  -> RTCDataChannel [browser transport ownership]
  -> received ArrayBuffer [browser transport ownership]
  -> Uint8Array payload view [no application copy]
  -> direct writable write OR bounded coalesced write batch [at most one batch copy]
```

## M3 Benchmark Defaults

`64 KiB` frame payload, `2 MiB` low / `8 MiB` high DataChannel watermarks, `256 KiB` read-ahead,
`8 MiB` receiver window, `256 KiB` write batch, `125 ms` UI snapshot interval, one reliable ordered
data channel, and main-thread WebRTC are implementation defaults. They remain conservative,
unselected defaults: the available evidence is a single same-host run per candidate, not a
repeatable physical-lab qualification. The Engine Lab rejects high watermarks above `16 MiB` after
Chromium rejected queued sends under a `32 MiB` high-water profile.

## Same-Host Evidence

All runs used two fresh in-app Chromium contexts on the same Windows 10 host, a real local 1 GiB
source selected through Chromium's file-input bridge, and the OPFS benchmark destination. Both
peers showed `COMPLETED`; SHA-256 verification passed. This is functional and loopback evidence,
not an internet or cross-device throughput claim.

| Profile    | Effective frame | Watermarks | Elapsed | Sender average | Final queues |
| ---------- | --------------: | ---------: | ------: | -------------: | -----------: |
| A          |          32 KiB |  1 / 4 MiB | 90.48 s |     95.31 Mbps |  0 / 0 bytes |
| Matched W8 |          64 KiB |  2 / 8 MiB | 90.67 s |     95.57 Mbps |  0 / 0 bytes |
| C          |          64 KiB | 2 / 16 MiB | 98.49 s |     88.05 Mbps |  0 / 0 bytes |
| D          |         128 KiB | 2 / 16 MiB | 91.06 s |     95.13 Mbps |  0 / 0 bytes |
| E          |   262,124 bytes | 4 / 16 MiB | 90.29 s |     96.57 Mbps |  0 / 0 bytes |

`256 KiB` is represented as `262,124` effective payload bytes to reserve the 20-byte FSTP frame
header inside the conservative 256 KiB WebRTC wire-frame ceiling. A 32 MiB high-water attempt
failed with `SOURCE_OR_TRANSPORT_FAILED` before application backpressure could act. It is recorded
as negative compatibility evidence, and M3 now rejects that profile. See
`benchmarks/results/2026-09-05/` for the structured reports.

## Verification

- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `pnpm test`: PASS
- `pnpm test:e2e`: PASS, one M2 large-file test skipped because no physical benchmark source was
  supplied
- `pnpm build`: PASS
- Engine Lab M3 256 KiB Chromium two-context transfer: PASS
- Engine Lab same-host 1 GiB frame matrix: PASS for 32 / 64 / 128 / 256 KiB requested payloads;
  all final sender and receiver queues were zero. The initial 256 KiB / 32 MiB profile failure was
  reproduced, documented, constrained, and re-run successfully at 16 MiB.
- Engine Lab 10 GiB same-host Chromium-to-OPFS transfer: PASS; `COMPLETED` on both peers after
  961.42 seconds with incremental SHA-256 verification. See
  `benchmarks/results/2026-09-05/m3-10gb-same-host-opfs.json`.

## Acceptance Matrix

| Criterion                                               | Status                                     |
| ------------------------------------------------------- | ------------------------------------------ |
| M2 correctness behavior retained                        | PASS                                       |
| Central tuning configuration                            | PASS                                       |
| Bounded read-ahead and receiver write queue             | PASS                                       |
| Frame and watermark candidate configuration             | PASS                                       |
| Buffer-copy audit                                       | PASS                                       |
| UI snapshot throttling and metrics interface            | PASS                                       |
| Pause/cancel cleanup unit coverage                      | PASS                                       |
| 1 GiB same-host browser-source to OPFS transfer matrix  | PASS                                       |
| 10 GiB same-host direct-browser-source to OPFS transfer | PASS                                       |
| 10 GiB native-picker to chosen-destination transfer     | NOT TESTED                                 |
| 25 / 75 GiB designated-lab transfer                     | NOT TESTED                                 |
| Frame-size benchmark measurements                       | PASS (single same-host runs)               |
| Watermark benchmark measurements                        | PASS (single same-host matched comparison) |
| 32 MiB high-water compatibility                         | FAIL; prevented by M3 validation           |
| Disk/network/CPU/memory baselines                       | NOT TESTED                                 |
| Slow source/destination physical tests                  | NOT TESTED                                 |
| Throttle/latency/loss physical tests                    | NOT TESTED                                 |
| Worker placement comparison                             | NOT TESTED                                 |
| Multiple-data-channel comparison                        | NOT TESTED                                 |
| Evidence-based selected performance default             | NOT TESTED                                 |

M3 implementation is complete, but M3 performance qualification is incomplete. M4 must not begin
until the untested physical-lab evidence has been gathered and reviewed. No internet-throughput,
memory, or broad browser-performance claim is made by this report.
