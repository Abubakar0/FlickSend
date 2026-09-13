# M5 Implementation Report

## Status

M5 CRYPTOGRAPHIC INTEGRITY: COMPLETE.

M5 FINAL VERIFICATION: PASS.

FSTP v4 implements `source block -> sender SHA-256 -> digest metadata -> payload frames ->
receiver SHA-256 -> compare -> destination write -> persisted verified checkpoint -> manifest root
-> VERIFIED -> DELIVERED`. The logical integrity/recovery block remains 8 MiB; network frames remain
at most 64 KiB. A receiver sends `TRANSFER_BLOCK_READY` before payload because WebRTC control and
data channels do not share ordering.

`SHA256` covers exact block payload bytes, including only actual bytes in a final partial block.
The single-file root hashes a documented canonical binary manifest. Blocks mismatch through NACK and
retry three times after the original attempt; exhaustion is `FS_BLOCK_INTEGRITY_FAILED`. `DELIVERED`
requires verified persisted blocks, an independent matching root, and successful destination close.

Recovery schema v3 stores a fixed-width SHA-256 digest table. Schema v2 M4 checkpoints are rejected
for v4 rather than promoted to trusted data. M4 transfer identity and receiver-authoritative missing
block recovery are retained; the real 1 GiB 50% qualification verified zero committed-block resend.

## Qualification

| Scenario                     | Blocks verified | Mismatches | Retries | Root        | Destination   | Delivered | Result |
| ---------------------------- | --------------: | ---------: | ------: | ----------- | ------------- | --------- | ------ |
| 1 GiB normal                 |             128 |          0 |       0 | match       | match         | yes       | PASS   |
| one-time payload corruption  |               1 |          1 |       1 | match       | verified path | yes       | PASS   |
| permanent payload corruption |               0 |          4 |       3 | not reached | not delivered | no        | PASS   |
| manifest root mismatch       |               1 |          0 |       0 | mismatch    | not delivered | no        | PASS   |
| 1 GiB resume at >=50%        |             128 |          0 |       0 | match       | match         | yes       | PASS   |

Browser qualification used Chromium, two local browser contexts, real WebRTC DataChannels, and an
OPFS destination. The current browser report records the integrity counters but does not persist
per-run hash/manifest timing fields; no hash throughput or physical-network performance claim is
made. UI stayed responsive in the observed normal, fault, and resume runs. Bounded memory follows
the single 8 MiB sender block plus frame/write buffers; a dedicated physical memory profile remains
deferred.

## Verification

Final closeout results:

- `pnpm typecheck`: PASS. 16 workspace tasks completed.
- `pnpm lint`: PASS. 9 workspace tasks completed with zero warnings.
- `pnpm test`: PASS. `engine-core` has 31 tests; integrity has 3; protocol has 8; resume has 6;
  filesystem-browser has 1; transport-webrtc has 2.
- `pnpm test:e2e`: PASS. 10 serial Chromium cases completed; 4 fixture-gated large qualification
  cases were skipped because their optional environment inputs were absent. The separately executed
  1 GiB M5 normal and 50% resume qualifications are recorded above.
- `pnpm build`: PASS. All 9 workspace build tasks completed, including Next.js production build and
  signalling Worker dry-run build.

The closeout suite explicitly proves that `DELIVERED` cannot occur with a missing or unverified
block, a digest mismatch, exhausted retry budget, a missing root, a root mismatch, or failed
destination finalization. It also proves verified committed recovery survives resume without
committed-block retransmission, and rejects a legacy M4 schema-v2 checkpoint rather than treating
it as verified v4 state.

M4 10 GiB long-run qualification: environmental timeout / deferred evidence. It is not M5 evidence.

## Deferred

M3 physical performance qualification: DEFERRED.

M6 StreamPack/folder transfer: NOT STARTED.

Application-layer payload encryption: NOT STARTED.

TURN route migration: NOT STARTED.

No architectural deviations.
