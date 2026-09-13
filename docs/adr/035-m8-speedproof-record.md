# ADR 035: Freeze A Privacy-Safe SpeedProof At Delivery

## Decision

Freeze a versioned `SpeedProofRecord` when a transfer reaches `DELIVERED`. Preserve the last
meaningful active bottleneck label because the terminal snapshot has no moving payload and is
correctly `UNKNOWN`.

## Consequences

The record is useful as local benchmark evidence without storing payload or private metadata. It is
an observability summary, not a delivery precondition, billing meter, entitlement input, or promise
of route performance in another environment.
