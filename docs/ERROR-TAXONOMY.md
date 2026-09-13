# Product Error Taxonomy

## Product Error Contract

Future product surfaces must represent an error with a stable product code, category, short title,
plain-English explanation, recommended action, retryability, and privacy-safe diagnostic metadata.
This document defines the system, not final UI copy or every implementation error.

The product code format is `FS-PRODUCT-<CATEGORY>-<REASON>`. It is stable across UI wording changes.
Existing engine/protocol codes remain implementation diagnostics; they are mapped to a product code and
must not be exposed raw to ordinary users. A support record may include a privacy-safe event reference,
product code, engine-code allowlist value, route category, transfer state, timestamp, and retry outcome.
It must not contain payload contents, filenames, full paths, session codes, transfer IDs, addresses,
SDP, candidates, credentials, or stack traces.

## Categories

| Category      | Stable-code prefix         | User concern                                                                |
| ------------- | -------------------------- | --------------------------------------------------------------------------- |
| `SOURCE`      | `FS-PRODUCT-SOURCE-*`      | The selected source can no longer be read safely.                           |
| `DESTINATION` | `FS-PRODUCT-DESTINATION-*` | FlickSend cannot safely write or finish at the chosen destination.          |
| `NETWORK`     | `FS-PRODUCT-NETWORK-*`     | A connection or recovery attempt cannot continue.                           |
| `RECIPIENT`   | `FS-PRODUCT-RECIPIENT-*`   | Recipient availability or invitation acceptance needs attention.            |
| `PERMISSION`  | `FS-PRODUCT-PERMISSION-*`  | Browser/source/destination access was denied, lost, or changed.             |
| `AUTH`        | `FS-PRODUCT-AUTH-*`        | Account, guest authorization, or invitation authorization failed.           |
| `STORAGE`     | `FS-PRODUCT-STORAGE-*`     | Local available space or product metadata storage cannot continue.          |
| `INTEGRITY`   | `FS-PRODUCT-INTEGRITY-*`   | Bytes or required integrity metadata cannot be verified.                    |
| `BROWSER`     | `FS-PRODUCT-BROWSER-*`     | The current browser/capability cannot safely perform the requested action.  |
| `SERVICE`     | `FS-PRODUCT-SERVICE-*`     | Signaling or another control-plane dependency is unavailable.               |
| `PEOPLE`      | `FS-PRODUCT-PEOPLE-*`      | A development People relationship or pairing action cannot continue safely. |
| `UNKNOWN`     | `FS-PRODUCT-UNKNOWN-*`     | No safe more-specific classification exists.                                |

## Required V1 Cases

| Product code                          | Title                                   | Plain explanation                                                                                        | Recommended action                                                         | Retryability                   | Example technical mapping                                   |
| ------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| `FS-PRODUCT-SOURCE-CHANGED`           | Source changed                          | The file or folder changed while it was being sent, so this transfer stopped to keep the result correct. | Choose the updated source and send again.                                  | New transfer required          | `FS_SOURCE_CHANGED`, `FS_STREAMPACK_SOURCE_CHANGED`         |
| `FS-PRODUCT-SOURCE-UNAVAILABLE`       | Can't read the source                   | FlickSend can no longer read the selected files or folder.                                               | Restore access, then retry or send again.                                  | Conditional                    | Source read/permission failure                              |
| `FS-PRODUCT-DESTINATION-PERMISSION`   | Can't save there                        | FlickSend no longer has permission to write to this destination.                                         | Choose or reauthorize a destination, then retry when supported.            | Conditional                    | Browser destination permission failure                      |
| `FS-PRODUCT-DESTINATION-UNAVAILABLE`  | Destination unavailable                 | The selected destination is no longer available.                                                         | Reconnect it or choose another supported destination.                      | Conditional                    | Destination adapter failure                                 |
| `FS-PRODUCT-STORAGE-FULL`             | Not enough space                        | The destination does not have enough available space.                                                    | Free space or choose another destination.                                  | Conditional                    | Quota/disk-full adapter failure                             |
| `FS-PRODUCT-DESTINATION-CHANGED`      | Destination changed                     | Previously saved verified data no longer matches what FlickSend expected.                                | Choose a clean destination and send again.                                 | New transfer required          | `STREAMPACK_DESTINATION_CHANGED`                            |
| `FS-PRODUCT-DESTINATION-FINALIZE`     | Couldn't finish saving                  | FlickSend could not finish the destination, so nothing was marked complete.                              | Check the destination and try again.                                       | Conditional                    | `DESTINATION_FINALIZATION_FAILED`                           |
| `FS-PRODUCT-RECIPIENT-WAITING`        | Waiting for recipient                   | The transfer is ready when the recipient accepts.                                                        | Keep FlickSend available or send a reminder later.                         | Automatic/conditional          | Valid offer awaiting acceptance                             |
| `FS-PRODUCT-RECIPIENT-UNAVAILABLE`    | Recipient isn't available               | The recipient is not currently available for this live transfer.                                         | Ask them to open the invitation, then reconnect or send again.             | Conditional                    | Peer left/no live peer                                      |
| `FS-PRODUCT-NETWORK-RECOVERING`       | Reconnecting                            | The connection was interrupted. Your verified progress is safe.                                          | Keep FlickSend open while it reconnects.                                   | Automatic                      | Recoverable `RECONNECTING`                                  |
| `FS-PRODUCT-NETWORK-UNAVAILABLE`      | Connection unavailable                  | FlickSend could not establish a connection.                                                              | Check your connection and ask the recipient to stay available.             | Conditional                    | Negotiation/connectivity failure                            |
| `FS-PRODUCT-NETWORK-RECOVERY-FAILED`  | Couldn't reconnect                      | FlickSend could not restore this transfer connection. Nothing unverified was marked complete.            | Check both connections and start a new transfer if recovery cannot resume. | New transfer or explicit retry | `FS_ROUTE_EXHAUSTED`, `FS_ROUTE_RECOVERY_FAILED`            |
| `FS-PRODUCT-INTEGRITY-RETRYING`       | Checking transferred data               | FlickSend couldn't verify part of this transfer and is retrying it.                                      | Wait while verification retries.                                           | Automatic                      | Nonterminal block mismatch                                  |
| `FS-PRODUCT-INTEGRITY-FAILED`         | Transfer couldn't be verified           | FlickSend could not verify this transfer. Nothing has been marked complete.                              | Send again after checking the source and destination.                      | New transfer required          | `FS_BLOCK_INTEGRITY_FAILED`, `FS_MANIFEST_INTEGRITY_FAILED` |
| `FS-PRODUCT-BROWSER-UNAVAILABLE`      | This browser can't complete that action | A required browser capability is unavailable or not qualified for this action.                           | Use a qualified Windows desktop browser or choose a supported action.      | Conditional                    | Capability reason code                                      |
| `FS-PRODUCT-AUTH-UNAUTHORIZED`        | You don't have access                   | This invitation or account is not authorized for the transfer.                                           | Sign in, request a new invitation, or contact the sender.                  | Conditional                    | Future auth/invitation policy                               |
| `FS-PRODUCT-PEOPLE-INVITE-INVALID`    | That invitation isn't available         | This development pairing code isn't available.                                                           | Ask the person for a new development pairing code.                         | New code required              | Invalid, expired, or already-consumed P6 code               |
| `FS-PRODUCT-PEOPLE-ALREADY-CONNECTED` | You're already connected                | This person is already in your People list.                                                              | Choose Send when you're ready to share something.                          | Not applicable                 | P6 code redemption for an existing connection               |
| `FS-PRODUCT-PEOPLE-BLOCKED`           | This connection isn't available         | You can't connect or start a new send while this relationship is blocked.                                | Unblock the person before creating a new connection.                       | Conditional                    | P6 blocked relationship or P4 eligibility guard             |
| `FS-PRODUCT-PEOPLE-SELF`              | You can't connect with yourself         | A person cannot create a relationship with their own identity.                                           | Ask another person to create a pairing code.                               | Not applicable                 | P6 self-code redemption                                     |
| `FS-PRODUCT-SERVICE-UNAVAILABLE`      | FlickSend is temporarily unavailable    | A service needed to arrange the transfer is unavailable.                                                 | Try again shortly.                                                         | Conditional                    | Signaling/control-plane failure                             |
| `FS-PRODUCT-UNKNOWN-FAILED`           | Transfer couldn't continue              | FlickSend stopped this transfer to avoid an incorrect result.                                            | Try again; provide the support reference if the problem continues.         | Conditional                    | Unclassified terminal error                                 |

## Presentation Rules

1. Never use an error surface to imply `COMPLETED` after integrity or destination failure.
2. Keep a recoverable route interruption in `RECONNECTING`; do not show terminal failure prematurely.
3. A terminal integrity error must say that nothing was marked complete.
4. Never show stack traces, raw protocol text, session codes, candidate data, or credentials by default.
5. Technical diagnostics require an explicit user action and retain only the approved safe metadata.
6. Exact wording and accessible presentation are P8 responsibilities; category, action, and retryability
   are frozen here.

## P8 Recovery Presentation Boundary

P8 consumes the existing product codes and prepared nonterminal recovery state; it introduces no new engine or
product error code. The canonical recovery headings, explanations, safety claims, and action labels are in
[`P8-RECOVERY-COPY.md`](P8-RECOVERY-COPY.md), while the reason-to-action mapping is in
[`P8-RECOVERY-ACTION-MATRIX.md`](P8-RECOVERY-ACTION-MATRIX.md). That presentation layer must not expose raw
engine codes or change error category, retryability, integrity, route, or delivery semantics.

## P5 Recipient Privacy Rule

P5 maps malformed, expired, unknown, and unauthorized pre-offer sessions to
`FS-PRODUCT-AUTH-UNAUTHORIZED` with generic unavailable copy. The ordinary recipient UI must not disclose which
condition occurred or reveal sender, source, count, size, path, transfer identity, route, or raw engine code.
Known receiver engine codes are normalized at the controller/reducer boundary into this taxonomy; internal
unprefixed engine names and adapter-facing `FS_*` names are never ordinary product copy.

## P6 People Privacy Rule

P6 invalid and expired development pairing codes use `FS-PRODUCT-PEOPLE-INVITE-INVALID` with generic copy. They
must not disclose whether the code owner exists, whether a relationship exists, private People metadata, a
relationship state, transfer data, or an internal ID. Development pairing remains qualification infrastructure,
not production invitation authorization.
