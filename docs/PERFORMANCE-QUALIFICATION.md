# Physical Performance Qualification

M10 measures the existing transfer engine on physical hardware. It does not tune protocol, framing,
buffer limits, route policy, or StreamPack merely to improve a result. Correctness remains the gate:
each retained passing transfer must report `DELIVERED`, receiver-authoritative verified integrity/root,
receiver verified bytes equal to the local fixture size, matching sender and receiver transfer identity
during validation, zero `duplicateRetransmittedBytes`, and zero `committedBlocksRetransmitted`.

## Evidence Classes

`SAME_HOST_PHYSICAL_BROWSER` is useful for browser lifecycle, integrity, bounded-memory behavior,
resume, and StreamPack functional stability. It is never evidence of physical network throughput,
network utilization, or cross-machine relay performance.

The approved Path B closeout applies when topology inspection records `SINGLE_MACHINE_ONLY`: real
local disk baselines, same-host 1 GiB and 10 GiB browser delivery, a 10 GiB resume, CPU/RAM samples,
Health/SpeedProof checks, and StreamPack stress can close the available-hardware roadmap gate. It
does not close the separately tracked two-machine physical-network gate.

`TWO_MACHINE_PHYSICAL` requires a sender and receiver on distinct physical computers joined by a real
network. It is required for any M10 network-throughput or utilization claim. The retained record uses
privacy-safe role labels and an operator attestation rather than host identifiers, so the artifact is
evidence of the recorded scenario, not cryptographic proof of the hardware identities.

## Retained Data And Privacy

All M10 JSON is immutable and written below `benchmarks/results/<date>/` with create-only writes.
Retained records exclude hostnames, usernames, addresses, MAC addresses, Wi-Fi names, executable and
filesystem paths, filenames, transfer IDs, raw payload data, browser command lines, and credentials.
The physical-transfer record reduces SpeedProof to safe aggregate timing, rates, route classes,
counts, health availability, and bottleneck fields. It does not embed the raw Engine Lab export.

Fixture sizes are retained as a coarse class such as `1_GIB` or `10_GIB`; no payload content is stored.
Input reports are read locally only to reconcile identity, route, integrity, and continuity before the
sanitized M10 artifact is written.

## Measurements

The harness records one environment record per peer, an `iperf3` TCP baseline in both directions,
explicit source-read and destination-write baselines, and bounded external browser-process samples.
The browser process sampler takes five-second samples, caps a run at 1,081 samples, and retains no
process ID, process name, command line, or profile path. It reports initial, average, peak, and final
memory plus average and peak CPU. A monotonic memory trend is reported only after at least three
non-decreasing samples and more than 10% growth; it is not inferred from a single snapshot.

Network utilization is calculated only as:

```text
(FlickSend application payload B/s * 8) / measured iperf3 TCP goodput bit/s
```

It is `NOT_QUALIFIED` without a measured baseline. Browser `availableOutgoingBitrate`, nominal NIC
speed, and same-host WebRTC rates are not substitutes. Browser WebRTC counters also do not establish
physical wire overhead.

The disk runner performs bounded 8 MiB sequential reads and deterministic writes with SHA-256
verification. Its status explicitly marks a run below system RAM as cache-state unknown; it must not
be described as sustained physical disk throughput. The output destination is create-only and must be
an approved empty path.

## Two-Machine Runbook

Use a controlled LAN or clearly label a Wi-Fi/VPN/WAN environment. Do not retain the peer address or
copy it into a report. Run the install and build commands on both physical machines:

```powershell
pnpm install
pnpm build
pnpm qualification:m10:sender -- --label=SENDER_A --browser=chrome
pnpm qualification:m10:receiver -- --label=RECEIVER_B --browser=edge
```

On the receiver, start an independently installed `iperf3` server. From the sender, run both TCP
directions; the runner invokes normal and reverse `iperf3` client tests and omits the peer address
from the retained JSON:

```powershell
iperf3 -s
pnpm qualification:m10:network -- --peer=<private-test-peer-address> --seconds=30
```

Run one explicit disk baseline on the sender with a pre-generated deterministic fixture and one on
the receiver with an empty approved write target. Paths are intentionally excluded from artifacts:

```powershell
pnpm benchmark:fixture -- --size=10GiB --output=<approved-sender-fixture-path>
pnpm qualification:m10:disk -- --read-input=<approved-sender-fixture-path>
pnpm qualification:m10:disk -- --write-output=<empty-approved-receiver-target> --size=10GiB
```

For every physical browser transfer, start a sidecar sample on each peer at transfer start and retain
the Engine Lab M8 JSON export from each peer after terminal completion. Use the dedicated browser
process running the test, not an unrelated daily-use browser process. The M8 export remains local
input; the M10 retain command strips its identifiers:

```powershell
pnpm qualification:m10:sample -- --pid=<sender-browser-pid> --seconds=<planned-transfer-seconds> --interval-ms=500
pnpm qualification:m10:sample -- --pid=<receiver-browser-pid> --seconds=<planned-transfer-seconds> --interval-ms=500
pnpm qualification:m10:retain -- --sender-report=<sender-m8-export> --receiver-report=<receiver-m8-export> --sender-environment=<sender-m10-environment> --receiver-environment=<receiver-m10-environment> --sender-sample=<sender-m10-samples> --receiver-sample=<receiver-m10-samples> --expected-route=DIRECT
```

Perform direct 1 GiB, 10 GiB, and 25 GiB transfers before making a completion decision. Use the
existing bounded File System Access or fixture destination only; M9 external Windows picker and
selected-handle evidence remains `DEFERRED / ACCEPTED PRODUCT RISK`, never a M10 filesystem pass.
Record StreamPack separately with structural, tiny-file, and mixed fixtures. For interruption tests,
perform one controlled interruption after known committed progress, allow recovery reconciliation,
then retain the same metrics: safe bytes, remaining bytes, resumed payload, ambiguous in-flight bytes,
duplicate retransmission, receiver-committed retransmission, reconciliation time, and final root.

Forced relay results must identify TURN/UDP, TURN/TCP, and TURN/TLS separately. Local M7 evidence
only qualifies UDP functional routing; it is not physical M10 relay throughput evidence. Production
TURN/TLS and production TURN deployment remain deferred.

## Completion Boundary

Path A requires a recorded two-machine environment, bidirectional network and disk baselines, real
two-machine 1 GiB and 10 GiB direct delivery, integrity/root verification, external CPU and memory
sampling, SpeedProof and Transfer Health cross-checks, a physical interruption/resume pass, zero
committed-block resend, and repository verification.

Path B may close the M10 available-hardware roadmap gate without a second authorized machine after
the equivalent real local disk, same-host 1 GiB and 10 GiB, 10 GiB resume, StreamPack, Health,
SpeedProof, integrity, CPU/RAM, and repository checks pass. Its status must retain
`M10 TWO-MACHINE PHYSICAL NETWORK QUALIFICATION: DEFERRED / ACCEPTED PRODUCT RISK`. The preferred
25 GiB and endurance cases may remain justified `DEFERRED`; no missing requirement may be relabeled
as a physical network performance result.

Run `pnpm qualification:m10` only as a local preflight. It builds the workspace and retains a
same-host environment/preflight pair; it intentionally exits successfully when the tooling works even
though physical qualification is incomplete.
