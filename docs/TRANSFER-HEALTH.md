# Transfer Health

M8 Transfer Health is a diagnostics observer. It helps explain a transfer without taking part in
framing, flow control, recovery, integrity, destination finalization, or delivery state. It receives
only aggregate counters and safe transport diagnostics. It never receives payload bytes, filenames,
paths, candidate strings, addresses, TURN credentials, session codes, or application API data.

## Ownership And Inputs

`@flicksend/transfer-health` is a pure TypeScript package with no React, WebRTC, filesystem,
authentication, database, or UI dependency. `engine-core` owns collection and passes a typed
`RawTransferMetrics` sample to the analyzer. `transport-webrtc` supplies only selected-pair route
class, RTT, browser `availableOutgoingBitrate` when present, and aggregate WebRTC byte counters.

The active M5/M6 engine records source reads after successful bounded source reads, completed
destination writes, DataChannel `bufferedAmount`, and bounded application receive backlog. Source
and destination B/s fields are **bounded local adapter work rates**, calculated from the time spent
inside each completed read or write operation. They help distinguish an adapter that is busy from a
route that is backpressured, but are not a disk benchmark, an OPFS benchmark, or a physical-device
throughput claim. A memory-backed `File` or OPFS adapter can legitimately report a very high burst
work rate for one 8 MiB logical operation. A `null` field means unavailable. It is never converted
to a measured zero. Browser outgoing bitrate remains an estimate, never a guaranteed capacity or a
forced data rate.

## Windows And Bounds

- Sampling cadence: 500 ms while the current WebRTC transport and route generation are active.
- Current rate window: 1 second. Rolling rate window: 5 seconds.
- Warmup: 3 seconds and 256 KiB of observed application payload.
- History: at most 120 samples, 64 events, and 16 route segments.
- Route replacement closes the previous segment and resets short-window inference; whole-transfer
  counters and the stable transfer ID remain intact.
- Metric publication remains bounded by the transfer UI snapshot interval. Raw 64 KiB frame events
  do not cause React rendering.

Sampling stops when the route is lost, a transfer is cancelled, or the coordinator disconnects.
Stale transport or route-generation callbacks are ignored.

## Health And Inference

The analyzer emits `STARTING`, `GOOD`, `DEGRADED`, `RECOVERING`, `STALLED`, `PAUSED`, or `UNKNOWN`.
It does not diagnose a bottleneck during warmup, pause, recovery, a stall, or missing observations.
Three agreeing samples are required before changing a non-terminal bottleneck result.

`LIKELY_SOURCE_READ_LIMIT` requires source read rate to track payload throughput, destination write
headroom, and frequent sender-queue draining. `LIKELY_DESTINATION_WRITE_LIMIT` requires destination
write rate to track payload, source headroom, and bounded receive-queue pressure.
`LIKELY_NETWORK_LIMIT` requires both local stages to have headroom while the sender queue sustains
high-water pressure. `LIKELY_RELAY_LIMIT` requires a slower relay segment relative to an earlier
direct segment in the same transfer. Sustained queue pressure without enough other evidence is
reported as `BACKPRESSURE_LIMIT`, not as a specific network claim.

Confidence is evidence quality, not certainty: `HIGH` requires four supporting signals, `MEDIUM`
two or three, and `LOW` otherwise. The exact reason codes accompany every result. `NONE_DETECTED`
means the available signals do not support a limit classification; it is not a claim of unlimited
capacity.

## SpeedProof

On `DELIVERED`, `engine-core` freezes a schema-versioned `SpeedProofRecord`. It includes transfer
ID, duration, application payload, average and peak throughput, observed source/destination rates,
route segments, route changes, stalls, integrity retries, reconnects, dominant active bottleneck,
confidence, and per-field measurement availability. It intentionally excludes payload, names,
paths, candidate details, addresses, credentials, and session codes.

The terminal health snapshot correctly becomes `UNKNOWN` because payload no longer moves. SpeedProof
instead preserves the last meaningful active diagnosis so the completion state itself is never
misreported as a bottleneck.

## Engine Lab And Evidence

Engine Lab exposes a diagnostics-only M8 panel and M8 JSON export. `?health=off` disables only the
observer for controlled overhead comparison; it cannot change transfer protocol or correctness.
`pnpm qualification:m8` builds, runs the real browser M5 health case, then runs real M5 sender and
receiver transfers with deterministic test-only paced source, destination, and transport adapters.
The adapters emit the engine's actual M5 metric snapshots; the test harness does not feed
hand-authored aggregate rate values to the analyzer. It retains raw JSON under the dated
`benchmarks/results/` directory.

Controlled analyzer inputs prove classification and hysteresis only. Paced M5 records prove the
same rules against actual engine behavior in a deterministic local harness. Browser M5/M6 and M7
coturn records prove actual route selection, delivery, integrity, and measured fields in their
recorded environment. None are internet, cross-device, cross-browser, physical storage, or
production throughput claims.

## M10 Physical Cross-Check

M10 does not change Transfer Health inference or add a bottleneck class. The approved same-host Path
B result cross-checks frozen SpeedProof and route segments against real local disk observations and
bounded browser-process samples. The M10 artifact keeps only safe aggregate SpeedProof fields and
route classes; it never retains the M8 export's transfer ID, browser user agent, paths, filenames,
addresses, candidate data, or credentials.

The 10 GiB Path B runs retained observed source-read values, zero queue backlog, direct route, and
`INSUFFICIENT_DATA` bottleneck conclusions when bitrate or destination-write evidence was unavailable.
That is the correct conservative result. An unavailable source/destination rate remains unavailable,
not zero. Until two-machine correlation exists, the observer must not be described as a physical
network-throughput or network-capacity measurement.
