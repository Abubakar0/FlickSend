# ADR-038: Keep Safari And Mobile Evidence Separate From Engine Emulation

## Status

Accepted for M9.

## Decision

Playwright WebKit is recorded only as WebKit automation, never Safari qualification. Playwright mobile
viewport/device descriptors are never Android or iOS/iPadOS qualification. Safari and real mobile
evidence requires a real browser/device record with browser version, operating system version,
environment type, capability snapshot, and explicit qualification outcomes.

The assisted evidence importer validates those fields before retaining a manual Safari/Android/iOS
artifact and updating the matrix.

## Consequences

Unavailable hardware produces `NOT_TESTED`, not a fabricated pass. Whether that blocks M9 completion
is an explicit product-support decision rather than an engineering inference.
