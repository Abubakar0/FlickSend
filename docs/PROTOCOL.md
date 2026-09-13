# Protocol

The future internal protocol is named FlickSend Transfer Protocol (FSTP), not FTP in user-facing
copy. Its initial negotiated `protocol_version` is `1`.

## M1 Signalling

M1 defines version-one, schema-validated JSON messages: session-ready, peer-joined, peer-left,
offer, answer, ice-candidate, and error. The relay accepts only text JSON whose UTF-8
representation is no more than 16,384 bytes. It relays offer, answer, and ICE candidates only,
and rejects invalid or service-originated message types.

M7 adds an optional positive `routeGeneration` to offer, answer, and ICE-candidate signals. It is
not an FSTP payload/control version field: it lets each browser reject queued signaling from an old
PeerConnection after route replacement. An answerer mirrors the offerer's generation on its answer
and candidates. Peers without the field retain M1 behavior but are not M7 recovery-qualified.

M1 opens two ordered WebRTC DataChannels with stable labels: fs-control-v1 carries a versioned
HELLO handshake, and fs-data-v1 carries only a deterministic 1 MiB binary proof.

The proof verifies every byte against its deterministic pattern and reports failure explicitly.
It is not a file-transfer protocol, does not define FSTP data frames, and must not be reused as
the later bulk-data implementation.

When M2 starts, FSTP must use compact binary payload frames, negotiated message limits, and an
explicitly versioned frame format. Network-frame sizes and logical-resume-block sizes are benchmark
decisions, not M0 constants.

## M3 Single-File Frames and Flow Control

M3 transfer protocol version 2 control messages are JSON on fs-control-v1: TRANSFER_OFFER,
TRANSFER_ACCEPT, TRANSFER_START, TRANSFER_FINISH, TRANSFER_VERIFY_OK, TRANSFER_PAUSE,
TRANSFER_RESUME, TRANSFER_FLOW_CONTROL, TRANSFER_CANCEL, and TRANSFER_FAIL. They carry only the
minimum file metadata and an opaque fs_tr UUID; absolute paths are rejected. M3 adds
`receiveWindowBytes` to acceptance and flow-control messages and a monotonic `bytesWritten`
acknowledgement. A sender must not send beyond `bytesWritten + receiveWindowBytes`.

File data is binary on fs-data-v1. Each frame has a fixed 20-byte big-endian header: byte 0 is
protocol version, byte 1 is frame type (1 for data), bytes 2-3 are zero flags, bytes 4-7 are the
transfer reference, bytes 8-15 are the byte offset, and bytes 16-19 are payload length. The
decoder requires the buffer length to exactly equal header plus payload and caps payloads at 256 KiB.

M3 benchmarks 32, 64, 128, and 256 KiB payload candidates, capped to the negotiated DataChannel
message limit minus the 20-byte header. Its incremental SHA-256 verification is an Engine Lab
delivery proof, not the M5 block-integrity protocol. Pause/resume is in-memory transfer control;
it does not define M4 persisted resume semantics.

## M4B Live Recovery Protocol

The active Engine Lab single-file route is FSTP v3. It keeps M3's 20-byte binary frame header and
64 KiB payload default, while scheduling 8 MiB logical resume blocks. The legacy v2 transfer is
isolated to M3 tests and is not reachable from the Engine Lab coordinator.

`TRANSFER_RESUME_OFFER` contains the opaque transfer ID/reference, manifest identity, source
metadata identity, filename, total bytes, block layout, and protocol version. The receiver validates
the offer against persisted recovery state and replies with ordered, bounded (at most 1,024 ranges
per page) `TRANSFER_HAVE_BLOCKS` messages. The sender accepts no payload schedule until the final
page and then computes missing blocks with `RecoveryReconciler`.

For each missing block the receiver processes ordered v3 frames, performs positional writes, saves
the compact committed ranges to OPFS metadata, and only then sends `TRANSFER_BLOCK_COMMITTED`.
Uncommitted in-flight blocks are treated as missing after interruption. `TRANSFER_BYTES_COMPLETE`
means all block writes are committed; it is explicitly not `DELIVERED` and has no M5 integrity claim.
Already verified progress is preserved. Recovery reporting distinguishes receiver-persisted safe bytes,
remaining logical bytes, resumed payload, ambiguous uncommitted in-flight resend, and true duplicate
retransmission. Payload for a committed block must not be scheduled again without a correctness reason.

# M5 FSTP v4 Integrity

The active Engine Lab path is FSTP v4. FSTP v3 remains historical M4 continuity coverage and is
not wire-compatible with v4 verified commits. A v4 peer must advertise `integrityAlgorithm: SHA256`
and manifest version 1. `TRANSFER_BLOCK_DIGEST` binds transfer ID, manifest identity, block index,
byte offset, actual block length, algorithm, and a lowercase 32-byte SHA-256 digest. The receiver
returns `TRANSFER_BLOCK_READY` before frames start because control and data channels have no shared
ordering guarantee.

The sender hashes exact logical block bytes, not headers or frame bytes. The final partial block is
hashed at its actual length; a zero-byte file has zero blocks and a valid empty manifest. Receiver
writes may occur while its incremental SHA-256 runs, but no block is checkpointed or acknowledged
until the computed digest matches. A mismatch sends `TRANSFER_BLOCK_NACK`; the sender retries at
most three times after the original attempt, then fails `FS_BLOCK_INTEGRITY_FAILED`.

Manifest bytes are canonical binary: `FSIM`, uint8 manifest version, uint8 algorithm ID, 42-byte
ASCII transfer ID, big-endian uint64 total bytes, big-endian uint32 block bytes, big-endian uint32
block count, then ordered 32-byte block digests. `manifestRoot = SHA256(manifestBytes)`. Ordered
digests make reordering, missing entries, wrong lengths, unsupported algorithms, and malformed
metadata fail validation. The receiver independently builds the root from its persisted digest table.

State progression is `TRANSFER_BYTES_COMPLETE -> VERIFYING -> VERIFIED -> DELIVERED`. `DELIVERED`
requires all blocks verified and persisted, a matching independent root, and successful destination
close. A root mismatch is `FS_MANIFEST_INTEGRITY_FAILED`, never delivery.

# M6 FSTP v5 StreamPack

V5 is separate from v4 single-file controls. It begins with STREAMPACK_OFFER, STREAMPACK_ACCEPT,
STREAMPACK_MANIFEST_BEGIN, bounded ordered STREAMPACK_MANIFEST_CHUNK messages, and
STREAMPACK_MANIFEST_END. The receiver validates the complete structural manifest and prepares the
destination before STREAMPACK_READY. Chunks carry at most 128 entries and 12 KiB serialized
metadata; they are not Base64 payload containers.

Each v5 logical block uses STREAMPACK_BLOCK_DIGEST, BLOCK_READY, BLOCK_COMMITTED, and BLOCK_NACK
with the same SHA-256/retry semantics as M5. HAVE_VERIFIED_BLOCKS remains block-oriented. The
canonical FSPK root binds schema, SHA-256, selected-root semantics, entry path bytes and types,
entry/file IDs, sizes, block settings, and ordered digests. DELIVERED requires destination close,
all verified blocks, and independent root verification.

On a replacement transport the sender re-offers the same transfer and manifest identities. The
receiver revalidates the manifest, re-hashes every checkpointed block from the chosen destination,
then emits bounded HAVE_VERIFIED_BLOCKS pages before READY. The sender schedules only blocks absent
from that receiver-authoritative map. A legacy v3 checkpoint, an unverified digest table, a changed
source identity, or a changed destination identity is not v5 verified recovery state and fails
explicitly.

V5 continuity evidence uses `safeBytesBeforeDisconnect`, `remainingBytesAtResume`,
`resumedPayloadBytes`, `duplicateRetransmittedBytes`, `committedBlocksRetransmitted`, and
`ambiguousInflightBytesRetransmitted`. The safe and remaining fields describe the latest recovery
episode and sum to the logical payload subject to a final partial block. Resumed and ambiguous
in-flight values accumulate across recovery episodes. Ambiguous bytes were sent before an
interruption for a block the receiver had not committed; they are safe to resend and are not
duplicate retransmission. Committed-block and duplicate values must remain zero absent a documented
correctness reason.

Malformed v5 controls, manifest validation failures, source changes, destination checkpoint
changes, and exhausted integrity retries transition to an explicit STREAMPACK_FAIL state. They must
not produce DELIVERED.

# M7 ICE Route Semantics

M7 makes no FSTP wire-format change: v4 single-file and v5 StreamPack controls remain transport
agnostic. A browser route is classified from the selected ICE candidate pair as `DIRECT_HOST`,
`DIRECT_SRFLX`, `RELAY_UDP`, `RELAY_TCP`, `RELAY_TLS`, or `UNKNOWN`; those diagnostics are local
observability data, not FSTP controls and never include addresses or candidate strings.

On route loss, the offerer may replace its PeerConnection using a new route generation and re-offer
the same FSTP transfer/manifest identity. The answerer accepts a replacement offer only into a new
PeerConnection. Existing M5/M6 `HAVE_VERIFIED_BLOCKS` reconciliation remains receiver-authoritative.
No route change may cause a committed verified block to be resent. Route exhaustion reports an
explicit `FS_ROUTE_EXHAUSTED`, `FS_TURN_AUTH_FAILED`, `FS_TURN_UNREACHABLE`, or credential-unavailable
error while retaining persisted verified recovery data for a later explicit retry.

# M8 Transfer Health Semantics

M8 makes no FSTP wire-format or control-message change. Transfer Health samples local aggregate
measurements outside the protocol: application payload counters, completed source reads and
destination writes, bounded queue gauges, and the already-sanitized M7 route diagnostics. It cannot
acknowledge data, change flow control, select a route, issue retries, alter recovery maps, or affect
integrity/finalization. A missing or failed browser statistics read is `UNAVAILABLE`, not zero and
not a protocol failure. Source and destination B/s fields describe bounded local adapter work time,
not physical disk or OPFS throughput.

M8 route segments are local diagnostics keyed by M7 route generation. They do not alter stable
transfer identity, FSTP v4/v5 compatibility, verified-block handling, or the rule that `DELIVERED`
requires integrity verification.
