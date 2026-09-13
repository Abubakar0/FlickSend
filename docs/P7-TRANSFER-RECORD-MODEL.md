# P7 Transfer Record Model

## Public Record

```ts
type TransferHistoryRecord = {
  recordId: string;
  direction: "sent" | "received";
  peerPersonId: string | null;
  sourceKind: "single_file" | "multiple_files" | "folder";
  totalBytes: number | null;
  fileCount: number | null;
  folderCount: number | null;
  productStatus: TransferRecordStatus;
  startedAt: string;
  endedAt: string | null;
  failureCategory: SafeFailureCategory | null;
  active: ActiveTransferMetadata | null;
  speedProof: SafeSpeedProofSummary | null;
};
```

`recordId` is an opaque random application ID safe for `/transfers/[record]`. It is never derived from or equal to
an FSTP transfer ID. The development store maintains any lifecycle correlation privately and never serializes it.

## Retained Fields

| Field                       | Why it exists                                                        | Active-only or history-safe       | Development store | Production policy                    |
| --------------------------- | -------------------------------------------------------------------- | --------------------------------- | ----------------- | ------------------------------------ |
| `recordId`                  | Safe detail-route identity.                                          | History-safe.                     | Yes.              | Future provider mapping deferred.    |
| `direction`                 | Distinguishes sent and received outcomes.                            | History-safe.                     | Yes.              | Retention deferred to P15.           |
| `peerPersonId`              | Resolves current People display/eligibility.                         | History-safe opaque ID.           | Yes.              | Authentication/data policy deferred. |
| `sourceKind`                | Explains file, multiple-file, or folder transfer without a name.     | History-safe.                     | Yes.              | Retention deferred to P15.           |
| `totalBytes`                | Presents transfer size.                                              | History-safe metadata.            | Yes.              | Retention deferred to P15.           |
| `fileCount` / `folderCount` | Presents aggregate contents without a tree.                          | History-safe metadata.            | Yes.              | Retention deferred to P15.           |
| `productStatus`             | Presents authoritative current/terminal product state.               | History-safe once terminal.       | Yes.              | Retention deferred to P15.           |
| `startedAt` / `endedAt`     | Supports ordering, time presentation, and duration context.          | History-safe metadata.            | Yes.              | Retention deferred to P15.           |
| `failureCategory`           | Provides safe product outcome context.                               | History-safe when failed.         | Yes.              | Safe support policy deferred.        |
| `active`                    | Supplies current progress, safe route class, health, speed, ETA.     | Active-only; cleared at terminal. | Yes while active. | Not a persistence contract.          |
| `speedProof`                | Presents frozen M8 transfer summary after available terminal output. | History-safe reduced summary.     | Yes.              | Retention deferred to P15.           |

## Safe SpeedProof Fields

`SafeSpeedProofSummary` retains duration, aggregate payload size, average/peak payload speed when observed,
reconnect count, stall count/duration, integrity retry count, route-change count, `Direct`/`Relayed` segments,
dominant supported bottleneck, confidence, and per-field availability. It removes M8 `transferId`, route detail,
event detail, raw candidate/network data, and any payload content.

## Prohibited Historical Fields

P7 must never store or render:

- Payload bytes or encoded payload content.
- Filename, folder display name, full source display name, full source/destination path.
- Manifest, file tree, relative paths, block hashes, digests, or resume map.
- Engine transfer ID, signaling session ID, WebRTC generation, or support reference derived from them.
- IP/MAC address, hostname, Wi-Fi name, ICE candidate, SDP, STUN detail, TURN credential, or candidate pair.
- Browser File objects, source handles, destination handles, or OPFS/IndexedDB/local/session storage history.
- Raw engine stack, protocol frames, raw product error code, analytics identifier, or People profile copy.

## Finalization Rules

The store accepts `COMPLETED` only with recorder-provided delivery confirmation for the same active transfer
identity. It freezes terminal records, so repeated `DELIVERED` does not change `endedAt` or create another record.
`FAILED` retains a safe category only. `CANCELED` has no failure category and is never shown as complete or failed.

## Development Retention

The process-local P7 store uses a 100-record development cap and evicts the oldest terminal record deterministically
when the cap is exceeded. It never evicts active records. This bound prevents unbounded test/integration growth; it
is not a production retention schedule. Production retention, deletion, export, and filename policy are deferred to
P15.
