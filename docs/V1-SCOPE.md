# V1 Scope Registry

## Status Meanings

`V1_REQUIRED` is necessary for the frozen V1 outcome. `V1_OPTIONAL` may improve V1 but must not block
the core handoff. `DEFERRED` needs later work or evidence. `OUT_OF_SCOPE` is intentionally not V1.
`NOT_QUALIFIED` has no V1 public support claim despite possible development evidence.

| Capability                                     | Scope           | Product contract and boundary                                                                   | Delivery/evidence owner                           |
| ---------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Send a single file                             | `V1_REQUIRED`   | Signed-in sender can send to an intended person.                                                | P3-P8 product; M0-M10 engine proven.              |
| Send multiple files                            | `V1_REQUIRED`   | Supported through the chosen source UX without cloud payload storage.                           | P3-P8.                                            |
| Send a folder                                  | `V1_REQUIRED`   | Preserve safe hierarchy, zero-byte files, and empty directories where browser semantics permit. | M6 proven; P3-P8 UX.                              |
| Receiver-verified integrity                    | `V1_REQUIRED`   | Completed only after the engine `DELIVERED` gate.                                               | M5 proven; P4/P8 presentation.                    |
| Verified recovery                              | `V1_REQUIRED`   | On supported interruption, receiver-verified progress is preserved and missing work continues.  | M4/M5/M6 proven; P4/P8 presentation.              |
| Direct browser-to-browser route                | `V1_REQUIRED`   | Prefer direct connection where available.                                                       | M7 functional evidence; production rollout later. |
| Relay fallback                                 | `V1_REQUIRED`   | Use a relay when direct connectivity fails; never expose route mechanics by default.            | M7 functional evidence; production TURN deferred. |
| Person-centric destination                     | `V1_REQUIRED`   | Person is the primary destination model, not a storage link.                                    | P3-P8/P10-P12.                                    |
| Authorized guest receive                       | `V1_REQUIRED`   | Guest can receive only the authorized transfer; account is optional for ordinary recipients.    | P10-P12 security/product work.                    |
| Sender account                                 | `V1_REQUIRED`   | Sender is an account holder.                                                                    | P10.                                              |
| People and send again                          | `V1_REQUIRED`   | Lightweight relationship model; not a social network.                                           | P11-P12.                                          |
| Basic metadata-only history                    | `V1_REQUIRED`   | Retain only operational summaries, never normal payload.                                        | P11-P15.                                          |
| Transfer Health and SpeedProof                 | `V1_REQUIRED`   | Advisory, conservative, privacy-safe status and completion summary.                             | M8 proven; P4/P8 UI.                              |
| Clear error and recovery UX                    | `V1_REQUIRED`   | Stable product category, action, and retryability; no false completion.                         | P4/P8.                                            |
| Chrome/Edge on Windows                         | `V1_REQUIRED`   | Primary Windows-first desktop targets, with picker evidence caveat.                             | M9 qualified with limitations.                    |
| Firefox on Windows                             | `V1_OPTIONAL`   | Secondary access with documented constraints, never a universal support claim.                  | M9 qualified with limitations.                    |
| Real external Windows picker                   | `DEFERRED`      | Accepted product risk until real assisted evidence closes it.                                   | M9 assisted qualification.                        |
| Two-machine physical network performance       | `DEFERRED`      | No throughput, utilization, or line-rate claim.                                                 | M10 Path A.                                       |
| Physical TURN performance                      | `DEFERRED`      | No production throughput claim for relayed traffic.                                             | Two-machine relay qualification.                  |
| Production TURN deployment                     | `DEFERRED`      | Local functional coturn evidence is not production deployment.                                  | Production security/operations phase.             |
| macOS                                          | `NOT_QUALIFIED` | No public product support claim.                                                                | Real Mac qualification.                           |
| Android, iOS, iPadOS                           | `NOT_QUALIFIED` | Responsive UI does not imply transfer support.                                                  | Real-device qualification.                        |
| Offline/asynchronous delivery                  | `DEFERRED`      | Sender and recipient generally remain available during a V1 transfer.                           | Future architecture milestone.                    |
| Cloud payload storage/library                  | `OUT_OF_SCOPE`  | Payload does not become normal FlickSend cloud storage.                                         | Product review required.                          |
| Automatic folder sync                          | `OUT_OF_SCOPE`  | V1 is handoff, not sync.                                                                        | Product review required.                          |
| Mesh, Turbo/native acceleration, native app    | `OUT_OF_SCOPE`  | Not part of initial V1.                                                                         | Future roadmap review.                            |
| WebTransport relay                             | `OUT_OF_SCOPE`  | Not part of V1 transport model.                                                                 | Future roadmap review.                            |
| Application-layer payload encryption           | `OUT_OF_SCOPE`  | Do not market E2EE or zero-knowledge claims.                                                    | Future security milestone.                        |
| Enterprise SSO, SCIM, admin, API, integrations | `OUT_OF_SCOPE`  | Avoid enterprise platform expansion in V1.                                                      | Future product review.                            |

Every later phase must preserve this registry unless a deliberate product-scope change updates both this
file and the P1 report.
