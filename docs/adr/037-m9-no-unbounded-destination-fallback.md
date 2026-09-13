# ADR-037: Do Not Replace Streaming Destinations With Blob Or OPFS Payload Caches

## Status

Accepted for M9.

## Decision

Browsers without a proven incremental selected-file or selected-directory destination are classified
with a limitation or as unsupported for that receive mode. FlickSend must not accumulate an entire
transfer in a Blob, memory-backed array, or OPFS payload cache as a compatibility fallback.

OPFS remains limited to recovery metadata and explicitly bounded Engine Lab fixtures. API availability
does not prove user permission restoration, positional write semantics, or browser-restart resume.

## Consequences

Compatibility can be narrower than a browser's generic download feature, but all browser paths retain
bounded memory, destination failure semantics, and the integrity-before-`DELIVERED` invariant.
