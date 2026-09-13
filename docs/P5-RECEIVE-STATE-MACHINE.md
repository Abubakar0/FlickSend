# P5 Receive State Machine

`ReceiveSessionController` owns the explicit application reducer in
`apps/engine-lab/app/receive/receive-state.ts`. React consumes the resulting snapshot; it does not assemble
independent loading flags or implement transport, integrity, recovery, StreamPack, or delivery logic.

| State                   | Entry Cause                                                                                      | Allowed Actions             | Next States                                                    | Terminal | Key Invariant                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `OPENING`               | Route/session changes                                                                            | None                        | `AUTHORIZING`, `FAILED`                                        | No       | Route work is revision-gated.                                                |
| `AUTHORIZING`           | Session code normalized; connection joins                                                        | None                        | `WAITING_FOR_SENDER`, `REVIEWING`, `FAILED`                    | No       | No offer metadata is rendered.                                               |
| `WAITING_FOR_SENDER`    | Authorized session has no offer, or an accepted sender is temporarily unavailable before payload | None                        | `REVIEWING`, `READY_TO_RECEIVE`, `FAILED`                      | No       | A prepared destination is retained only for the active authorized transfer.  |
| `REVIEWING`             | Engine reports an authorized `READY` offer                                                       | Accept, decline             | `CHOOSING_DESTINATION`, `CANCELED`                             | No       | Only the offer transfer ID becomes active.                                   |
| `CHOOSING_DESTINATION`  | Recipient accepts or cancels picker                                                              | Choose destination          | `PREPARING_DESTINATION`, `READY_TO_RECEIVE`                    | No       | No payload starts without a destination.                                     |
| `PREPARING_DESTINATION` | Native picker or fixture destination is preparing                                                | Replace request             | `CHOOSING_DESTINATION`, `READY_TO_RECEIVE`                     | No       | Destination revision rejects stale async completion.                         |
| `READY_TO_RECEIVE`      | Safe destination prepared                                                                        | Change destination, receive | `PREPARING_DESTINATION`, `CONNECTING`                          | No       | Destination identity and active transfer ID must match.                      |
| `CONNECTING`            | Existing engine accept method invoked                                                            | Confirm cancel              | `RECEIVING`, `RECONNECTING`, `VERIFYING`, `FAILED`, `CANCELED` | No       | UI does not render WebRTC/FSTP internals.                                    |
| `RECEIVING`             | Engine reports receive activity                                                                  | Confirm cancel              | `RECONNECTING`, `VERIFYING`, `FAILED`, `CANCELED`              | No       | Progress and safe bytes are engine-snapshot-derived.                         |
| `RECONNECTING`          | Existing engine reports recovery                                                                 | Confirm cancel              | `RECEIVING`, `VERIFYING`, `FAILED`, `CANCELED`                 | No       | Same transfer and destination remain active; verified progress is preserved. |
| `VERIFYING`             | Bytes complete, finalizing, or integrity verification active                                     | Confirm cancel              | `COMPLETED`, `FAILED`, `CANCELED`                              | No       | Byte completion cannot become product completion.                            |
| `COMPLETED`             | Matching active transfer reports `DELIVERED`                                                     | None                        | None                                                           | Yes      | `DELIVERED` is the only completion authority.                                |
| `FAILED`                | Session unavailable or terminal engine/destination error                                         | None                        | None                                                           | Yes      | No metadata on pre-offer failure; no completion without a new transfer.      |
| `CANCELED`              | Recipient declines or confirms active cancellation                                               | None                        | None                                                           | Yes      | Cancellation is neither failure nor delivery.                                |

## Cross-State Rules

- Only a snapshot for the active `transferId` may update an active recipient screen or produce `COMPLETED`.
- A repeated authorized `READY` offer for that same transfer refreshes the engine snapshot but never resets
  accepted destination preparation or receiving state back to `REVIEWING`.
- Changing route/session increments the session revision; obsolete coordinator snapshots cannot update the new
  route. Changing a destination increments the destination revision; obsolete picker work is aborted/ignored.
- An authorized recipient whose prepared sender becomes temporarily unavailable enters `WAITING_FOR_SENDER`, rather
  than a terminal error. A matching `CONNECTED` snapshot returns it to `READY_TO_RECEIVE`; only the existing engine
  can then progress it to `RECEIVING`.
- The engine retains ownership of FSTP recovery, M5 integrity, M6 StreamPack reconstruction, verified-block
  resend policy, and M7 route selection. The controller only invokes accepted engine APIs and maps snapshots.
- `DELIVERED` is unreachable after missing/unverified data, digest/root mismatch, exhausted integrity retry,
  destination mutation, or destination finalization failure because the existing engine reports a terminal
  failure instead.
