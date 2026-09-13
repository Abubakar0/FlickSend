# P7 Transfers Implementation Report

## Status

```text
P7 TRANSFERS: COMPLETE
P7 FINAL VERIFICATION: PASS
TRANSFERS EXPERIENCE: FROZEN
```

## Transfers Mental Model

P7 is a concise history of live and recent transfer metadata. It is not cloud storage, a file library, a sync
center, or a network console.

## Architecture And Repository Boundary

`TransfersController` owns list state and repository calls. `TransferLifecycleRecorder` converts prepared P4/P5
workflow snapshots into bounded metadata transitions. `DevelopmentTransfersRepository` adapts the server-local
`DevelopmentTransferStore`; the UI has no transfer correctness authority.

```text
P7 DEVELOPMENT TRANSFER STORE
NOT PRODUCTION TRANSFER DATABASE

PRODUCTION HISTORY RETENTION:
DEFERRED TO P15
```

The store is process-local, development-only, 100-record bounded, and returns 404 in production runtime. It does
not use browser storage, recovery metadata, payload caching, or production database infrastructure.

## Record Model And Privacy-Safe Metadata Policy

Records use an opaque `recordId` distinct from FSTP identity. The full model and prohibited fields are in
[P7-TRANSFER-RECORD-MODEL.md](P7-TRANSFER-RECORD-MODEL.md). P7 retains only safe aggregate metadata, current
opaque peer identity, product status, safe outcome category, active metrics, and reduced M8 SpeedProof output.
Filenames, folder names, paths, manifest/tree data, hashes, engine/session IDs, browser handles, raw errors, and
network identifiers are excluded. Historical filename persistence remains deferred to P15.

## Active Transfer Handling

Active P4/P5 snapshots create or update one record through an opaque runtime lifecycle key. Writes occur at
meaningful transitions or a 750 ms cadence, never per frame. The route is observational and has no transfer action.

## Sender And Receiver Integration

P4 records sender metadata through the existing prepared sender snapshot. P5 records recipient metadata through its
prepared receiver snapshot. Neither integration changes Send/Receive behavior, selection, authorization, integrity,
recovery, destination correctness, or cancellation.

## Terminal Outcomes And Recovery

`COMPLETED` is recorded only after engine `DELIVERED` matches the active transfer identity. `FAILED` retains only a
safe category, and `CANCELED` is distinct. Recovery, route replacement, repeated snapshots, and repeated delivery
reuse one record and freeze terminal summaries.

## People Resolution And Send Again

P7 resolves current P6 `peerPersonId` only. Removed People become `Former connection`; unresolved peers become
`Unknown person`; neither case deletes history. Send again is visible only for a connected sent peer and opens P4
with that person preselected and no old source, source handle, session, or transfer identity. Received records have
no redownload or receive-again action.

## SpeedProof

P7 composes actual M8 output after reducing it to safe observed fields. It omits transfer IDs, route details, and
network identifiers. Missing metrics render as `Unavailable` or `Not enough information`, never zero. SpeedProof is
an observed transfer diagnostic, not an internet-speed or physical-performance claim.

## Accessibility And Responsive Behavior

The implementation uses semantic headings, native detail links, keyboard filters, text-bearing status badges,
accessible Send again action, readable metric labels/units, and responsive layouts. P7 browser evidence exercises
list/detail controls, keyboard filtering, large safe metadata, and 1440 px through 390 px viewport widths.

## Security And Privacy

Review covers transfer/session exposure, record opacity, filename/path/manifest exclusion, stale event isolation,
People eligibility, source-handle reuse, SpeedProof route/network leakage, route authorization assumptions, and
unsafe display rendering. Focused unit and browser tests pass.

## Tests

Focused Engine Lab tests cover record creation, opacity, delivery authority, recovery/delivery deduplication,
failed/canceled distinction, stale-event isolation, bounded eviction, ordering, filters, and safe SpeedProof mapping.

P7 browser qualification passes seven executed cases:

1. P4 active record to one verified metadata-only completion, detail, SpeedProof, and Send again.
2. P5 receipt to a safe received history record.
3. Recovery to one record with frozen reconnect evidence.
4. Safe failed record with no completion.
5. Real P5 cancellation retained as canceled.
6. Removed/blocked People history and Send-again eligibility behavior.
7. Keyboard operation and responsive presentation at large safe metadata volumes.

## P4/P5/P6 Regression

P7 adds an observational P4/P5 lifecycle recorder and P6-gated Send again. The final browser suite passed all P4
(7), P5 (10), and P6 (6) executed real-engine/product cases with no failures.

## Engine Qualification Decision

```text
M4-M10 DEDICATED QUALIFICATION:
NOT RERUN — NO ENGINE CORRECTNESS CHANGE
```

P7 changes no engine runtime package. The normal browser suite still executes retained engine-backed coverage.

## Repository Verification

| Command             | Actual result                                                             |
| ------------------- | ------------------------------------------------------------------------- |
| `pnpm typecheck`    | `PASS` - 25/25 Turbo tasks.                                               |
| `pnpm lint`         | `PASS` - 14/14 Turbo tasks.                                               |
| `pnpm test`         | `PASS` - 25/25 Turbo tasks; Engine Lab: 36 tests in 7 files.              |
| `pnpm test:e2e`     | `PASS` - 65 configured; 47 executed/passed; 18 environment-gated skipped. |
| `pnpm build`        | `PASS` - 14/14 Turbo tasks.                                               |
| `pnpm format:check` | `PASS`.                                                                   |

All seven P7 cases executed and passed; none was skipped. The 18 skipped E2E cases are existing environment-gated
physical/network qualification cases and are outside the P7 product qualification scope.

## Known Limitations And Deferred P8-P15 Work

- Production authentication: `DEFERRED — P10`.
- Production database: `DEFERRED — P11`.
- Production history retention and deletion policy: `DEFERRED — P15`.
- Historical filename persistence: `DEFERRED — P15`.
- Advanced recovery UX: `P8`.
- Deep accessibility audit: `P9`.
- Production invitation authorization and TURN: `DEFERRED`.
- Analytics: `P28`.
- Offline delivery: `NOT V1`.

## Acceptance Matrix

| Requirement                               | Result |
| ----------------------------------------- | ------ |
| AGENTS P7 boundary updated                | `PASS` |
| `/transfers` route                        | `PASS` |
| Transfer detail surface                   | `PASS` |
| P3 components reused                      | `PASS` |
| Transfers controller/repository boundary  | `PASS` |
| Development-store boundary documented     | `PASS` |
| Opaque history record identity            | `PASS` |
| Raw transfer ID hidden                    | `PASS` |
| Filename/folder-name persistence excluded | `PASS` |
| Full paths excluded                       | `PASS` |
| Active sender transfer recording          | `PASS` |
| Active receiver transfer recording        | `PASS` |
| DELIVERED-only completed history          | `PASS` |
| Failed history                            | `PASS` |
| Canceled history                          | `PASS` |
| Recovery remains one record               | `PASS` |
| Duplicate event protection                | `PASS` |
| Stale event protection                    | `PASS` |
| Metadata-only bounded history             | `PASS` |
| Sent/received filtering                   | `PASS` |
| SpeedProof composition                    | `PASS` |
| Missing diagnostic handling               | `PASS` |
| Safe route presentation                   | `PASS` |
| Send again via existing P4 flow           | `PASS` |
| Old source handle not reused              | `PASS` |
| P6 eligibility respected                  | `PASS` |
| Removed People does not erase history     | `PASS` |
| Accessibility                             | `PASS` |
| Responsive layout                         | `PASS` |
| Security/privacy review                   | `PASS` |
| P4 regression                             | `PASS` |
| P5 regression                             | `PASS` |
| P6 regression                             | `PASS` |
| No P8+ scope creep                        | `PASS` |
| Repository verification                   | `PASS` |

## Next Phase

```text
NEXT PHASE:
P8 - RECOVERY UX
```

P8 is not authorized or started.
