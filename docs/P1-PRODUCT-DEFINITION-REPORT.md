# P1 Product Definition Report

## Status

```text
P1 V1 PRODUCT DEFINITION FREEZE: COMPLETE
P1 FINAL VERIFICATION: PASS
V1 PRODUCT SCOPE: FROZEN
```

P1 is a definition freeze only; it contains no P2 brand/legal work, product UI, authentication,
billing, database, notification, production TURN, or engine implementation.

## Frozen V1 Definition

FlickSend V1 is a browser-first, person-to-person handoff for huge files and folders. It is not cloud
payload storage, a drive, sync, collaboration, DAM, or file manager. The canonical definition is
[PRODUCT-DEFINITION-V1.md](PRODUCT-DEFINITION-V1.md).

## Primary Customer And Golden Use Case

The primary customer is a creative professional who directly hands large work to another person. The
reference use case is a videographer sending an approximately 184 GB, 23,421-file project folder to an
editor while preserving hierarchy and verified progress across a supported interruption. The numbers
are illustrative product fixtures, not performance promises.

## Positioning And Jobs

Working tagline: **Send files like messages.** Working promise: **Drop it. FlickSend takes care of the
rest.** The name/brand is not legally cleared. The primary jobs are send, receive, supported recovery,
previous-transfer summary, send again, and People. The product destination is a person, not a cloud
link or storage library.

## Platform, Guest, And People Policy

Windows Chrome and Edge are primary; Windows Firefox is secondary with documented limitations. macOS
and mobile are not yet qualified. Senders require an account; authorized ordinary recipients may
receive as guests. A guest receives only necessary transfer metadata and the authorized payload, never
private account, People, history, or settings access. People is a lightweight send-to relationship,
not a social network.

## Transfer, Resume, And Completion Contract

Product lifecycle states are `PREPARING`, `WAITING_FOR_RECIPIENT`, `CONNECTING`, `TRANSFERRING`,
`RECONNECTING`, `PAUSED`, `VERIFYING`, `COMPLETED`, `FAILED`, and `CANCELED`.
[TRANSFER-STATE-MAPPING.md](TRANSFER-STATE-MAPPING.md) requires `DELIVERED` before product Completed,
keeps recoverable loss in Reconnecting, and prevents an integrity/destination failure from looking
complete. “Verified progress” means receiver-persisted work that does not need to be resent in a
supported recovery; it is not a browser-restart, sleep, or offline-delivery promise.

## V1 Inclusions And Exclusions

V1 includes file/folder handoff, person-centric sending, authorized guest receive, direct/relay route
model, verified integrity/recovery, StreamPack hierarchy fidelity, progress/health, metadata-only
history, People, send again, clear errors, and privacy-safe diagnostics. It excludes cloud payload
storage, offline delivery, sync, collaboration, mobile-first transfer, background/while-asleep
transfer, Mesh, Turbo, native apps, WebTransport relay, enterprise platform features, and
application-layer payload encryption. The reviewable source of truth is [V1-SCOPE.md](V1-SCOPE.md).

## Claims And Limitations

Claims are controlled by [PRODUCT-CLAIMS.md](PRODUCT-CLAIMS.md) and
[PERFORMANCE-CLAIMS.md](PERFORMANCE-CLAIMS.md). The policy prohibits universal-browser/device support,
Mac/mobile support, physical-network speed/utilization, fastest/competitor claims, cloud/offline
delivery, restart persistence, and application-layer E2EE claims. The complete known-risk register is
[DEFERRED-RISKS.md](DEFERRED-RISKS.md).

## Product Success Metrics

The core success event is an intended sender-to-recipient transfer that leaves the recipient with a
verified complete destination. The north-star candidate is verified recipient-completed transfers.
Future metrics prioritize completion, time to first successful send, recovery success, recipient
completion, repeat senders, and recipient-to-sender conversion, never raw upload volume.

## Documents Created Or Updated

- Created [PRODUCT-DEFINITION-V1.md](PRODUCT-DEFINITION-V1.md).
- Created [V1-SCOPE.md](V1-SCOPE.md).
- Created [PRODUCT-CLAIMS.md](PRODUCT-CLAIMS.md).
- Created [TRANSFER-STATE-MAPPING.md](TRANSFER-STATE-MAPPING.md).
- Created [ERROR-TAXONOMY.md](ERROR-TAXONOMY.md).
- Created [DEFERRED-RISKS.md](DEFERRED-RISKS.md).
- Updated [PRODUCT.md](PRODUCT.md), [PERFORMANCE-CLAIMS.md](PERFORMANCE-CLAIMS.md),
  [SECURITY.md](SECURITY.md), [ROADMAP.md](ROADMAP.md), and [AGENTS.md](../AGENTS.md).

## Architecture Consistency Review

| Review point         | Result                        | Basis                                                                                               |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Payload model        | PASS                          | V1 remains browser-to-browser; normal payload does not enter the application API or database.       |
| Integrity/completion | PASS                          | Product Completed maps only from engine `DELIVERED`; M5 failure cases remain terminal.              |
| Recovery             | PASS                          | Product promise is bounded to verified supported recovery; no restart, sleep, or offline promise.   |
| Folder fidelity      | PASS                          | V1 uses M6 StreamPack semantics without exposing its protocol terminology.                          |
| Routing              | PASS WITH DEFERRED OPERATIONS | Direct/relay model agrees with M7; production TURN and physical relay performance remain deferred.  |
| Platforms            | PASS WITH LIMITATIONS         | Windows-first matches M9 evidence; picker risk remains accepted; macOS/mobile remain not qualified. |
| Performance          | PASS WITH RESTRICTIONS        | Same-host evidence is never presented as network throughput/utilization or a competitor claim.      |
| Encryption           | PASS                          | No application-layer E2EE/zero-knowledge claim is made.                                             |
| Offline delivery     | PASS                          | Explicitly outside the live-peer V1 model.                                                          |

## Product Simplicity Review

Every `V1_REQUIRED` item in [V1-SCOPE.md](V1-SCOPE.md) directly helps a person hand a huge file or
folder to another person, preserve correctness through supported recovery, or understand the outcome.
Features that do not directly serve that job are marked `V1_OPTIONAL`, `DEFERRED`, or `OUT_OF_SCOPE`.
This excludes cloud storage, collaboration, sync, content search, enterprise administration, and
technical tuning from V1.

## Repository Verification

All verification was run after the P1 documentation updates with Node.js 24.19.0. M7-M10 qualification
was not rerun because P1 changed documentation only and did not alter engine/runtime behavior.

| Command             | Result                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`    | PASS - 23/23 Turbo tasks succeeded.                                                              |
| `pnpm lint`         | PASS - 13/13 Turbo tasks succeeded with zero warnings permitted.                                 |
| `pnpm test`         | PASS - 22/22 Turbo tasks succeeded; 125 Vitest assertions passed.                                |
| `pnpm build`        | PASS - 13/13 Turbo tasks succeeded, including Engine Lab production build and signaling dry-run. |
| `pnpm format:check` | PASS - all matched files use Prettier formatting.                                                |

## Acceptance Matrix

| Requirement                                                                   | Result         |
| ----------------------------------------------------------------------------- | -------------- |
| Primary customer, golden use case, positioning, and pillars frozen            | PASS           |
| Windows-first platform policy and claim restrictions frozen                   | PASS           |
| Send/receive, guest, People, and lifecycle contracts defined                  | PASS           |
| Completion mapped to `DELIVERED`; resume accurately bounded                   | PASS           |
| Error, privacy, security, accessibility, scope, and claims contracts recorded | PASS           |
| Inclusions, exclusions, success definition, and deferred risks recorded       | PASS           |
| M0-M10 architecture consistency review                                        | PASS           |
| P2+ implementation                                                            | NOT APPLICABLE |
| Repository verification                                                       | PASS           |

## Next Phase

```text
NEXT PHASE:
P2 — BRAND / DOMAIN / LEGAL CLEARANCE
```

P2 has not started.
