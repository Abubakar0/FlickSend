# ADR-024: M4 Recovery Map Before M5 Block Integrity

## Status

Accepted for M4 implementation.

## Context

M4 requires durable transfer identity, logical resume blocks, persisted recovery state, and
receiver-to-sender reconciliation. M5 separately owns cryptographic block digests, a manifest root,
and corruption recovery. Treating a destination write as a cryptographically verified block before
M5 would make an unsupported integrity claim.

## Decision

M4 uses `@flicksend/resume`, a framework-independent package, for validated transfer recovery
metadata. It uses an 8 MiB candidate logical block size and compact committed-block ranges. The
receiver map is authoritative during reconciliation, and an unacknowledged block remains missing.
OPFS stores only this small recovery metadata; it is never the default payload store.

M4 recovery destinations must expose validated positional writes. A recovery map can be sparse, so
an append-only writer cannot safely receive a missing block after already committed data.

M4 names a block `committed` only after its bytes are durably written by the destination adapter.
It does not name the block cryptographically verified and it does not permit `DELIVERED` based on
the recovery map. M5 will add the digest and manifest-root conditions required for that claim.

## Consequences

The recovery model can support non-contiguous missing blocks and later Mesh without tying the
engine to React, Next.js, or OPFS. Existing M3 sequential transfer behavior stays protocol version
2 while M4's recovery handshake and random-access transfer adapter are implemented and tested.
Every transition of this metadata requires 10/50/90% interruption coverage.
