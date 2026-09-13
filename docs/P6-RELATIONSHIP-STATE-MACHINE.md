# P6 Relationship State Machine

The P6 `PeopleController` and development repository own all relationship transitions. React renders prepared
snapshots and never derives relationship state from independent boolean flags.

| State              | Entry Cause                                                   | Legal Actions                                 | Next States                                                         | Persistent | Critical Invariant                                                                  |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `UNCONNECTED`      | No relationship record exists                                 | Create code, redeem a valid other-person code | `INVITED_OUTGOING`, `INVITED_INCOMING`, `CONNECTED` by cross-invite | No         | A display name is never sufficient to create a relationship.                        |
| `INVITED_OUTGOING` | Another person redeemed this person's code                    | Wait, block                                   | `CONNECTED`, `BLOCKED`, `UNCONNECTED` after recipient decline       | Yes        | Pending is not connected and is not eligible for normal Send.                       |
| `INVITED_INCOMING` | This person redeemed another person's code                    | Accept, decline, block                        | `CONNECTED`, `UNCONNECTED`, `BLOCKED`                               | Yes        | Accept is idempotent and can create exactly one connection.                         |
| `CONNECTED`        | Incoming invitation accepted or inverse invitations converged | Send, remove, block                           | `UNCONNECTED`, `BLOCKED`                                            | Yes        | Connected is future Send eligibility only, never payload authorization.             |
| `BLOCKED`          | This person explicitly blocks a known relationship            | Unblock                                       | `UNCONNECTED`                                                       | Yes        | Blocked people cannot invite, accept, or use normal Send; unblock never reconnects. |

## Cross-State Rules

- Relationship identity is the sorted pair of opaque person IDs. Exactly one record may exist for each pair.
- Repeated create, accept, decline, remove, block, and unblock requests are idempotent or safely deduplicated.
- A code redemption matching an existing inverse invitation is mutual intent and converges directly to one
  `CONNECTED` record. It never creates two pending rows.
- A code redemption matching the same-direction pending invitation leaves that single pending relationship
  unchanged.
- A self redemption fails at the relationship layer with `FS-PRODUCT-PEOPLE-SELF` and creates no record.
- A blocked relationship prevents future code redemption and Send eligibility. A hidden UI button is not the
  security boundary: the repository and sender eligibility guard enforce it too.
- Pairing codes are separate from transfer/session/transport identities and cannot authorize payload access.
- The controller attaches a monotonically increasing revision and opaque client instance ID to mutations. Older
  client results and lower server revisions are ignored, so stale operations cannot overwrite newer state.
- Relationship state changes have no authority over an already active transfer. Transfer identity and correctness
  remain engine-owned.
