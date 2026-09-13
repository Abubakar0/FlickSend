# ADR-025: M4B Activates One FSTP v3 Recovery Pipeline

## Status

Accepted for Engine Lab M4B.

## Context

M4 implemented recovery records, FSTP v3 controls, positional browser writes, and simulation tests,
but the live Engine Lab remained on FSTP v2. That split could not prove persisted receiver commits
or recovery after a WebRTC transport replacement.

## Decision

The active Engine Lab single-file coordinator is `ResumableSingleFileTransfer`. It uses FSTP v3
for its offer, HAVE_BLOCKS pagination, binary payload frames, committed-block ACKs, and interim
`TRANSFER_BYTES_COMPLETE` state. The old v2 `SingleFileTransfer` remains only as an isolated M3
legacy test fixture.

The receiver owns recovery truth. For each logical 8 MiB block it performs positional destination
writes, persists the OPFS recovery record, then emits `TRANSFER_BLOCK_COMMITTED`. On a replacement
transport, the same coordinator and transfer ID send a new resume offer; the receiver validates the
manifest/source binding and sends ordered bounded HAVE_BLOCKS pages before source reads resume.

## Consequences

M4B retains M3's 64 KiB frames and bounded DataChannel watermarks. It does not make any M5
cryptographic verification or `DELIVERED` claim. Chosen browser destinations require user-assisted
re-selection after a page reload because browser file-handle permissions are not persisted here.
