# P4 Send State Machine

`SendSessionController` owns the explicit product reducer in `apps/engine-lab/app/send/send-state.ts`.
Visual components consume one prepared workflow snapshot; they do not combine independent loading booleans or
implement transfer correctness.

| State                   | Entry Cause                                              | Allowed Actions                              | Next States                                                    | Terminal | Key Invariant                                                 |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `SELECTING_RECIPIENT`   | New or reset sender session                              | Select recipient                             | `SELECTING_SOURCE`                                             | No       | No source can be prepared without a recipient.                |
| `SELECTING_SOURCE`      | Recipient selected, source cleared, or preparation error | Select files/folder; change recipient        | `PREPARING_SOURCE`, `SELECTING_RECIPIENT`                      | No       | No Send action is available.                                  |
| `PREPARING_SOURCE`      | Files/folder selected                                    | Replace/clear source; change recipient       | `READY_TO_REVIEW`, `SELECTING_SOURCE`                          | No       | Revision guards ignore stale preparation completion.          |
| `READY_TO_REVIEW`       | Valid source preparation completed                       | Change recipient/source; Send                | `WAITING_FOR_RECIPIENT`                                        | No       | Recipient, source, and required capability must be valid.     |
| `WAITING_FOR_RECIPIENT` | Session created, peer not ready                          | Change selection only before active transfer | `CONNECTING`, `TRANSFERRING`, `FAILED`                         | No       | Development handoff is not a production invitation.           |
| `CONNECTING`            | Engine is negotiating/connected before payload transfer  | Change selection only before active transfer | `TRANSFERRING`, `RECONNECTING`, `FAILED`                       | No       | No transport implementation detail is displayed.              |
| `TRANSFERRING`          | Engine is sending/receiving active transfer              | Confirm cancel                               | `RECONNECTING`, `VERIFYING`, `COMPLETED`, `FAILED`, `CANCELED` | No       | Progress is engine-snapshot-derived.                          |
| `RECONNECTING`          | Engine or connection reports recovery                    | Confirm cancel                               | `TRANSFERRING`, `FAILED`, `CANCELED`                           | No       | Transfer identity and verified progress are retained.         |
| `VERIFYING`             | Engine is at byte-complete/finalization/verification     | Confirm cancel while active                  | `COMPLETED`, `FAILED`, `CANCELED`                              | No       | Byte completion alone is not product completion.              |
| `COMPLETED`             | Active engine transfer reports `DELIVERED`               | Send something else                          | `SELECTING_SOURCE`                                             | Yes      | Completion requires matching active identity and `DELIVERED`. |
| `FAILED`                | Engine terminal failure or session creation failure      | Start a new send                             | `SELECTING_SOURCE`                                             | Yes      | It cannot become completed without a new engine transfer.     |
| `CANCELED`              | Explicit active-transfer cancellation                    | Start a new send                             | `SELECTING_SOURCE`                                             | Yes      | Cancellation is never represented as failure or completion.   |

## Cross-State Invariants

- Only an engine snapshot carrying the active `transferId` can update an active sender screen.
- Selecting a recipient or source before start invalidates the existing coordinator, offer attempt, and preparation
  revision. A stale asynchronous source result or stale session cannot target the new recipient.
- `COMPLETED` is impossible without engine `DELIVERED`; 100% React progress has no completion authority.
- `RECONNECTING` is nonterminal. Engine M4/M5/M6 recovery owns reconciliation, integrity, and resend policy.
- P4 maps engine errors but does not reimplement FSTP, integrity, StreamPack, route, or delivery transitions.
