# ADR-026: FSTP v4 verified delivery

## Status

Accepted.

## Decision

FSTP v4 is a separate wire protocol from M4's v3 recovery path. It requires `SHA256` block
metadata, a `TRANSFER_BLOCK_READY` control acknowledgement before payload on the separate data
channel, verified-block commits, bounded NACK retries (three retries after the initial attempt),
and a canonical manifest-root exchange before `DELIVERED`.

Each logical 8 MiB block is read into one bounded source buffer, hashed, framed into at most 64 KiB
payload frames, incrementally hashed by the receiver while positional writes occur, and checkpointed
only after the digest matches. The receiver's fixed-width digest table is persisted with recovery
metadata. Recovery schema v2 is intentionally rejected by v4 because v2 commits were not verified.

## Consequences

FSTP v3 remains only for historical M4 test coverage. The active Engine Lab coordinator uses v4.
The one-block-at-a-time acknowledgement boundary is correctness-first and is not an M3 throughput
claim. No application-layer encryption, folders, TURN migration, Mesh, or offline delivery is added.
