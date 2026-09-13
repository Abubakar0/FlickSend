# ADR 044: P7 Development Transfer History Boundary

## Status

Accepted for P7 development and integration qualification.

## Context

Transfers needs live and recent metadata while P11 production persistence and P15 data-governance retention remain
unimplemented. History must not become a payload cache, recovery database, or source of delivery authority.

## Decision

P7 uses a process-local, development-only repository capped at 100 records with deterministic oldest-terminal
eviction. It consumes only prepared P4/P5 snapshots through `TransferLifecycleRecorder`. Engine transfer identity
stays in a private client-runtime mapping; the server receives only a separate opaque lifecycle key and emits a
separate opaque history `recordId`.

The public record includes only safe aggregate metadata and reduced M8 SpeedProof diagnostics. It excludes names,
paths, payload, manifests, engine/session IDs, browser handles, raw errors, and networking identifiers. A completed
record requires recorder-confirmed engine `DELIVERED` for the same transfer identity.

## Consequences

This enables real P4/P5 product evidence without promising production persistence, retention, cloud storage, or
redownload. A later P11/P15 implementation must replace the repository adapter and explicitly review data model,
authorization, retention, deletion, and historical-name policy without changing P7's no-correctness-authority rule.
