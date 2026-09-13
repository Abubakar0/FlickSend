# Benchmarks

M0 establishes the benchmark directory and reporting rule. No throughput or browser capability
benchmark has been run, and the repository must not make performance claims.

Every future benchmark report must record timestamp, commit, engine/protocol version, browser and
OS versions, hardware, source/destination storage, network/route, frame and block settings,
watermarks, dataset, conditions, throughput, time to first byte, memory, CPU, resume events,
retransmitted bytes, integrity result, and completion result.

Use a controlled end-to-end baseline such as `iperf3` where possible. Physical lab machines, not
shared CI runners, are required for performance qualification.

## M3 Reporting

Use `benchmarks/runner/m3-plan.mjs` to record exact planned frame, watermark, read-ahead,
receive-window, write-batch, UI interval, channel-count, and worker-mode settings. The Engine Lab
downloads an M3 measurement JSON after a run; it excludes real filenames, paths, and payload data.
`m3-compare.mjs` ranks verified reports by average throughput only and deliberately does not select
a default without human review of memory, CPU, queue, and stability evidence.

The current same-host Chromium reports are functional evidence only. They include a 1 GiB frame
matrix, a matched 64 KiB 8 versus 16 MiB high-water comparison, a 10 GiB run, and negative evidence
that a 32 MiB high watermark can exceed Chrome's send queue. They do not qualify internet, device,
disk, CPU, memory, or cross-browser performance.

M3 exports bounded, downsampled local time-series samples for sent/received bytes, DataChannel
buffer occupancy, receive queue, and transfer/read/write rates. The sample store is capped and
downsampled so a long benchmark does not create proportional memory growth.

## M4C Fixtures

Generate deterministic qualification input with bounded 8 MiB writes; generated payloads are
ignored by Git. For example:

```powershell
pnpm benchmark:fixture --size=1GiB --output=benchmarks/fixtures/m4c-1g.bin
```

The command checks filesystem capacity before creating the fixture and prints an incremental
SHA-256 result. Its non-zero byte pattern is `byte[offset] = offset % 251`, so an unwritten
sparse destination cannot pass equality validation.

## M4C Continuity Metrics

M4C evidence reports `safeBytesBeforeDisconnect`, `remainingBytesAtResume`,
`resumedPayloadBytes`, `duplicateRetransmittedBytes`, `committedBlocksRetransmitted`, and
`ambiguousInflightBytesRetransmitted`. Post-reconnect payload is not generically called
"retransmitted": missing logical payload is legitimate, while duplicate payload is an error signal.
Historical `retransmittedBytes` fields remain unchanged and are deprecated for new M4C evidence.

# M5 Integrity Evidence

M5 browser evidence must record actual FSTP v4 runs separately from M4 results. Required fields are
block count, SHA-256 metrics, mismatch/retry counts, root result, destination fixture equality,
verification state, delivery state, and environment limitations. M4's 10 GiB v3 timeout is not M5
integrity evidence. Hashing is correctness-first; no physical throughput claim is made without a
controlled benchmark.

# M6 StreamPack Evidence

M6 fixture generation is local and bounded-memory: pnpm benchmark:folder-fixture supports
structural, tiny-many, mixed, and large profiles. Generated folders remain ignored by Git. M6
reports must identify file/directory counts, payload and manifest bytes, logical blocks, frames,
writer-handle peak, retry/recovery facts, root verification, and full tree equality. It must not
report filenames, paths, or payload contents outside deterministic local fixtures.

Folder continuity uses the same explicit vocabulary as M4C. `safeBytesBeforeDisconnect` and
`remainingBytesAtResume` describe the latest recovery; `resumedPayloadBytes` and
`ambiguousInflightBytesRetransmitted` are cumulative across all recovery episodes. Do not call all
post-reconnect payload "retransmitted": only `duplicateRetransmittedBytes` represents bytes already
known to be safely committed. `committedBlocksRetransmitted` and
`duplicateRetransmittedBytes` are expected to be zero in the M6 qualification scenarios.

Browser qualification artifacts are emitted under ignored `test-results/m6-evidence/` and then
copied verbatim into dated `benchmarks/results/` evidence at milestone closeout. Earlier M6 JSON
attempt records are historical evidence and remain unchanged; they are not retroactively relabeled
as passing browser transfers.

# M7 Route Qualification

Run `pnpm qualification:m7` for actual M7 evidence. It starts the pinned local coturn service with
a one-run random shared secret, gives the local signaling Worker temporary variables, executes only
the M7 Playwright suite, and removes the generated secrets during teardown. The suite is skipped by
ordinary `pnpm test:e2e`; skipped tests are never relay qualification evidence.

An M7 evidence record must state coturn image/version, browser, OS, local network topology, policy,
selected route type/detail/protocol, transfer and manifest identity stability, reconnection count,
route-change count, route recovery timing, bytes after recovery, verified root/hash result, fixture
equality, and terminal result. It must cover direct normal, forced relay M5, forced relay M6,
direct-to-relay recovery, relay replacement, invalid credentials, and no reachable relay. No
throughput comparison is implied by route correctness evidence.

The September 8, 2026 local Chromium/coturn qualification passed all ten gated M7 cases. Its raw
records are in `benchmarks/results/2026-09-08/m7-*.json`. The optional relay-to-AUTO attempt
delivered with a stable transfer ID but selected relay again, so it is evidence of AUTO fallback and
continuity, not a claim that TURN-to-direct reacquisition is universally qualified.

# M8 Transfer Health Evidence

M8 evidence distinguishes three classes:

- Deterministic analyzer inputs prove warmup, hysteresis, recovery and pause suppression, route
  segmentation, bounded history, unavailable-measurement behavior, and the explicit
  `INSUFFICIENT_DATA` fallback. They are not physical performance evidence.
- Deterministic paced source, destination, and transport adapters drive the real M5 sender and
  receiver engine. Their `m8-paced-*.json` records contain actual emitted M5 source/destination
  work counters, sender backpressure, receiver backlog, verified manifest root, fixture match, and
  `DELIVERED`; they do not inject aggregate classifier rates. They qualify the observer's local
  inference behavior only, not physical storage or network performance.
- Browser M5/M6 records prove that the engine can collect actual source/destination/queue and safe
  route fields through a delivered WebRTC transfer. The local 16 MiB M5 record includes direct
  route, measured source/destination fields by role, no integrity retry, and frozen SpeedProof.
- M7 coturn records augmented in M8 retain the same real direct/forced-relay/direct-to-relay route
  evidence with health snapshots. The dedicated `m8-direct-to-turn-route-health.json` records
  direct, recovery, relay warmup, and post-warmup active states with stable transfer identity and
  verified delivery. It does not claim independent TURN/TCP qualification or TURN-to-direct
  reacquisition because the existing M7 evidence does not prove either.

Run `pnpm qualification:m8` with the supported Node runtime to build the workspace, execute the
browser M5 health test and real-engine paced M5 qualification, then retain required `m8-*.json`
evidence under the dated `benchmarks/results/` directory. The default observer cadence is 500 ms
with 120 samples, 64 events, and 16 route segments; benchmark reports must state missing fields as
unavailable, not zero. Source and destination B/s are bounded adapter work rates, never a physical
disk, OPFS, or internet throughput claim. Historical raw values such as 8,388,608,000 B/s are
preserved evidence from the earlier inter-operation tracker and must not be relabeled as physical
storage speed.

## M9 Compatibility Evidence

`pnpm qualification:m9` builds the workspace, discovers actual desktop browser executables, and
records dated real-browser artifacts plus `m9-browser-matrix.json`. Existing core artifacts are
retained only when their real-browser, host, and executable-version fields still match; otherwise the
target is requalified. An absent browser, macOS host, or real mobile device is `SKIPPED`/`NOT_TESTED`,
never a synthetic pass.

M9 records environment class, actual launched browser version, engine, OS/version, architecture,
feature snapshot, capability reason codes, and safe aggregate outcomes. It is functional
compatibility evidence, not a physical throughput, disk, storage quota, or network benchmark.
Playwright WebKit and mobile emulation remain separately labeled engineering evidence and cannot be
used as Safari or real-device results.

The September 9, 2026 matrix records real Chrome 152.0.7977.83, Edge 152.0.4191.66, and Firefox
155.0.1 on Windows 10 x64. Chrome and Edge passed direct M5 integrity, M4 verified resume,
deterministic integrity retry, M6 structural StreamPack, forced local coturn UDP relay, and
direct-to-relay recovery. Firefox passed the direct core cases through standard WebDriver BiDi, but its
forced local relay safely ended with `FS_ROUTE_EXHAUSTED`; its relay and direct-to-relay cells are not
upgraded. All passing resumes preserve the transfer ID with zero duplicate payload and zero
receiver-committed block retransmission.

Headed Chrome and Edge lifecycle artifacts record actual refresh and persistent-profile restart after
receiver-visible committed progress. Both are `NOT_SUPPORTED` for the bounded fixture; Playwright did
not expose a hidden tab, so background behavior remains `NOT_TESTED`. These are functional lifecycle
observations, not performance measurements or selected-filesystem evidence.

Real picker and external destination sessions are assisted evidence, not automation. The Engine Lab
exports a small privacy-safe JSON record, which `pnpm qualification:m9:assisted -- --input <artifact>`
validates and adds to a dated matrix. The local native-computer automation could not initialize, so no
picker evidence was generated. Partial records remain partial; neither an API probe nor a picker
selection upgrades a support tier. `pnpm qualification:m9:macos` must run on a real Mac; its Windows
invocation deliberately skips without treating WebKit as Safari. Production TURN remains deferred.

## M10 Physical Performance Evidence

M10 separates `SAME_HOST_PHYSICAL_BROWSER` functional/lifecycle evidence from
`TWO_MACHINE_PHYSICAL` qualification. Same-host records are never used for network throughput,
utilization, cross-machine relay performance, or physical disk claims. Every M10 artifact is
create-only under `benchmarks/results/<date>/m10-*.json`; it excludes host identifiers, addresses,
Wi-Fi names, paths, filenames, transfer IDs, raw payload data, and credentials.

The M10 runner records privacy-safe environment inventory, bidirectional `iperf3` TCP baseline when
available, bounded 8 MiB sequential disk checks, bounded external browser-process samples, and a
sanitized transfer record. The transfer validator locally reconciles sender/receiver identity and
then retains only a coarse fixture-size class, delivery/root facts, safe continuity metrics, safe
SpeedProof aggregates, and process summaries. It rejects a physical record when delivery/root/route
does not match, duplicate payload is non-zero, receiver-committed blocks are resent, or either peer
lacks external CPU/RAM samples.

Calculate utilization only as application payload B/s converted to bit/s divided by measured `iperf3`
goodput from the same environment. Nominal NIC speed, browser outgoing-bitrate estimates, and M8
adapter work rates are not baselines. Disk records below available RAM are marked cache-state unknown
and cannot be called sustained storage throughput.

The September 10, 2026 Path B evidence adds real 10 GiB disk baselines; same-host 1 GiB and 10 GiB
browser transfers; a 10 GiB 50% interruption/resume; Health on/off comparison; and 10,000-file
StreamPack stress. It closes the available-hardware roadmap gate and M4 10 GiB same-host correctness,
not M3 two-machine throughput or physical network utilization. Every Path B transfer retains
`physicalNetworkUtilization: null`. Details and claim restrictions are in the
[M10 implementation report](M10-IMPLEMENTATION-REPORT.md) and
[performance claims registry](PERFORMANCE-CLAIMS.md).
