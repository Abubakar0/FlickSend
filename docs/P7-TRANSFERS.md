# P7 Transfers

## Purpose

P7 presents live transfer activity and recent transfer metadata. It answers what is sending or receiving,
what happened, whether it completed, who it was with, how much it transferred, how long it took, and whether
it reconnected. It is not a cloud file library, storage browser, sync center, network console, or system log.

## Active And Recent

`/transfers` uses the frozen P3 AppShell and separates `Active` records from `Recent` terminal records. It offers
only `All`, `Sent`, and `Received` filters and sorts newest first. `/transfers/[record]` exposes one opaque
application history record. The URL never contains an engine transfer ID, signaling/session code, WebRTC
generation, path, filename, or route detail.

## Architecture

```text
Transfers UI
  -> TransfersController
  -> DevelopmentTransfersRepository
  -> DevelopmentTransferStore

P4/P5 prepared workflow snapshots
  -> TransferLifecycleRecorder
  -> TransfersController
```

The recorder observes prepared product snapshots at bounded meaningful transitions or a 750 ms active cadence.
It never observes payload frames, protocol frames, recovery maps, or raw transport diagnostics. P7 has zero
authority over delivery, recovery, integrity, StreamPack, routing, destination correctness, cancellation, or
resume state. P4, P5, and the engine remain authoritative.

## Repository Boundary

```text
P7 DEVELOPMENT TRANSFER STORE
NOT PRODUCTION TRANSFER DATABASE
```

The current store is process-local and development-only. It returns 404 in a production runtime. It has no
localStorage, sessionStorage, IndexedDB, OPFS, browser source/destination handle, payload, or recovery-state use.
It retains at most 100 records when terminal records are available for deterministic oldest-first eviction; active
records are never evicted merely to meet the development cap. This is not a production retention policy.

```text
PRODUCTION HISTORY RETENTION:
DEFERRED TO P15
```

## Metadata Policy

P7 retains the record model in [P7-TRANSFER-RECORD-MODEL.md](P7-TRANSFER-RECORD-MODEL.md). Historical records
contain only direction, opaque peer identity where available, source kind, total size, item counts, product
outcome, timestamps, and a reduced safe SpeedProof summary. Display filenames, folder names, source display
names, source/destination paths, manifests, trees, digests, engine IDs, signaling/session IDs, browser handles,
raw errors, network identifiers, analytics, and payload are prohibited.

```text
HISTORICAL FILENAME PERSISTENCE:
DEFERRED TO P15
```

## Lifecycle And Terminal Outcomes

`TransferLifecycleRecorder` maps P4 sender and P5 receiver snapshots to one private runtime lifecycle key per
engine transfer identity. That engine identity remains in the recorder's in-memory map and is never posted to the
history API, stored in a record, rendered, or put in a route. The repository creates a new opaque `recordId` for
the public record.

Repeated snapshots, `DELIVERED` replays, reconnects, route replacement, and React remounts update the same record.
Terminal records freeze `endedAt` and terminal SpeedProof data. `COMPLETED` is accepted only when the recorder has
confirmed engine `DELIVERED` for the same active identity. Progress reaching 100% is not completion authority.
`FAILED` stores only a safe category, and `CANCELED` remains distinct from both failed and completed.

## People And Send Again

P7 retains only P6 `peerPersonId`. Current display data is resolved through the People provider; when no current
relationship is resolvable, the UI says `Former connection` or `Unknown person` without recreating a connection.
Removing or blocking a person never rewrites prior outcomes or deletes transfer history.

`Send again` exists only for a historical sent record whose peer is currently `CONNECTED`. It opens the frozen
P4 `/send` workflow with the person preselected and with no source. It never reuses a File, folder handle,
session, transfer ID, or payload. Received records never offer a fake download or receive-again action.

## SpeedProof

P7 composes the frozen M8 `SpeedProofRecord`; it never recalculates transfer health or throughput in React. It
reduces that output to safe duration, payload size, average/peak payload speed, reconnect/stall/integrity counts,
route class (`Direct`/`Relayed` only), bottleneck, confidence, and field availability. Route details and the M8
transfer ID are discarded. Missing metrics render as `Unavailable` or `Not enough information`, never zero.

SpeedProof is an observed transfer summary and diagnostic. It is not an internet speed test, ISP score, maximum
bandwidth claim, or physical-network benchmark.

## Accessibility And Responsive Behavior

The route uses semantic headings, native focusable links, textual `StatusBadge` state, keyboard-operable filters,
an accessible Send again name, readable metric labels/units, and no chart-only meaning. It is reviewed at 1440,
1280, 1024, 768, and 390 CSS pixels. Desktop remains the primary P7 quality target; 390 px is layout evidence only.

## Boundaries

P7 adds no P8 recovery controls, manual reconnect/retry, troubleshooting, production authentication/database,
production retention policy, historical names, cloud storage, redownload, analytics, production TURN, offline
delivery, Mesh, Turbo, teams, or enterprise features. P9 owns the deep accessibility audit; P10, P11, and P15 own
production authentication, database persistence, and data governance respectively.
