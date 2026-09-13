# FlickSend V1 Product Definition

## Status

This document freezes the V1 product definition. It is a contract for later phases, not an
implementation of product UI, accounts, People, guest invitations, history, or production services.
The working name is **FlickSend** and the working tagline is **Send files like messages.** Neither is
a statement of trademark, domain, legal-name, or brand clearance.

## Product Identity

FlickSend is a browser-first, person-to-person handoff product for huge files and folders. Its mental
model is `Person -> file/folder -> send`; technical session links are supporting mechanics, not the
primary user model. The internal product promise is: **Drop it. FlickSend takes care of the rest.**

FlickSend V1 is not a cloud drive, file-storage service, sync product, collaboration suite, DAM, or
file manager. Normal payload bytes do not pass through the FlickSend application API. The transfer
model is browser-to-browser, direct when possible and relayed when direct connectivity fails.

## Primary Customer

The primary V1 customer is creative professionals who regularly hand large files and folders directly
to another person. This includes videographers, video editors, photographers, creative agencies,
production teams, and freelance creators. V1 is not defined as a generic enterprise file-management
platform.

## Golden Use Case

A videographer sends an approximately 184 GB project folder containing approximately 23,421 files to
an editor. The editor receives the original files and folder hierarchy. If a supported interruption
occurs after verified progress, the transfer continues from that progress rather than restarting from
zero.

These values are product-design fixtures, not performance guarantees.

## Problem And Positioning

Creative professionals need to hand a large, original-quality file or folder to a specific person
without turning the task into cloud storage, a link-management workflow, or a manual restart after an
interruption.

FlickSend V1 is the easiest browser-first way to hand huge files and folders directly to another
person, with verified continuity and clear transfer status. Candidate promise direction, pending P2
brand/legal and later marketing review:

> Send files like messages. Huge files and folders, straight to the person who needs them. Verified
> progress survives supported interruptions.

## Product Pillars

### Send To People

The destination is a person. Users should think “send this folder to Alex,” not “upload this somewhere
and manage a link.”

### Zero Friction

Ordinary receiving should require as little setup as safely possible. A recipient is not required to
create an account merely to receive an ordinary authorized transfer.

### Never Start Over

For supported recovery, verified progress is safe and FlickSend continues only the remaining work. UI
language is calm and non-technical: “Connection interrupted. Your verified progress is safe.
Reconnecting...”

### Huge Folders Just Work

Folders preserve hierarchy, files, zero-byte files, and empty directories where browser semantics
permit. Paths are canonical and safe; integrity is mandatory. StreamPack is an internal implementation
term, not normal product terminology.

### Know What's Happening

Users receive progress, verified progress, speed, a reliable ETA when available, connection/recovery
state, a conservative slowdown explanation, and completion verification. Unavailable or unreliable
measurements are not shown as precise facts.

## Supported Platform Policy

V1 is Windows-first desktop.

| Tier              | Product policy                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| Primary           | Google Chrome stable on Windows and Microsoft Edge stable on Windows.          |
| Secondary         | Mozilla Firefox stable on Windows, with documented limitations.                |
| Not yet qualified | Chrome, Safari, and Firefox on macOS; Chrome on Android; Safari on iOS/iPadOS. |

“Not yet qualified” is not “broken” or “unsupported.” Public claims for those platforms remain
disabled until real-platform evidence exists. The detailed evidence tiers are in
[COMPATIBILITY.md](COMPATIBILITY.md).

## Core Jobs

| Job               | V1 outcome                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send              | A signed-in sender chooses a person, chooses files or a folder, reviews the transfer, sends, observes progress, and can cancel when appropriate.                |
| Receive           | A recipient opens an authorized invitation, sees the sender and a limited summary, accepts, chooses a supported destination, receives, verifies, and completes. |
| Resume            | On a supported interruption, verified progress survives, recovery is visible, and only missing work continues.                                                  |
| Previous transfer | A user can view a privacy-minimized summary of prior transfers.                                                                                                 |
| Send again        | A user can initiate another transfer to a previously used person with minimal friction.                                                                         |
| People            | A user can manage people they send to frequently.                                                                                                               |

## Navigation Model

The smallest useful top-level application model is `Send`, `Transfers`, `People`, and `Account /
Settings`. The default product focus is “Send something,” not a metrics-heavy dashboard. P3/P4 decide
the visual treatment; P1 creates no navigation UI.

## Send Workflow

1. Choose a person.
2. Drop or select files or a folder.
3. Review basic transfer information.
4. Send.
5. Establish the transfer and show progress/health.
6. Recover automatically when safely possible.
7. Verify completion before showing Completed.

V1 does not require a transfer title, category, tags, project metadata, description, expiration rules,
compression control, or technical route selector.

## Receive Workflow

1. Open an invitation or session.
2. Identify the sender and show the necessary limited transfer summary.
3. Accept the transfer.
4. Choose a destination where supported.
5. Establish the transfer and receive.
6. Verify the destination and show completion.

Initial V1 generally requires both sender and recipient to remain available during the transfer. V1 does
not imply that a recipient can download tomorrow after the sender has left, or that a sender can shut
down immediately after sending.

## Guest Model

Guest receiving is required where it can be made safe. An authorized guest may open a valid invitation,
view only necessary transfer metadata, accept, and receive payload. A guest does not automatically gain
access to the sender's private account information, other transfers, People graph, account settings, or
private history. Sender accounts are required; ordinary authorized recipient accounts are optional.

The later authorization design must make invitation access bounded and revocable. P1 does not implement
guest links or choose an authentication provider.

## Authentication Expectation

V1 requires a sender account. Ordinary recipients may remain guests where safely authorized. Later
account work must support login, logout, verification, recovery, session/device security, and account
deletion. P10 owns implementation and provider selection; P1 does not select a provider.

## People Model

People is not a social network. A Person is someone the user can send to. V1 planning may include a
display name, avatar, relationship/trust state, recent transfer context, and reliable availability. A
future person may have multiple devices, but device management is not the primary UI model.

The planned relationship states are `UNCONNECTED`, `INVITED`, `CONNECTED`, and `BLOCKED`. Later product
work must support invite, accept, remove, and block. People relationships never bypass per-transfer
authorization.

## Transfer Lifecycle

The product states are `PREPARING`, `WAITING_FOR_RECIPIENT`, `CONNECTING`, `TRANSFERRING`,
`RECONNECTING`, `PAUSED`, `VERIFYING`, `COMPLETED`, `FAILED`, and `CANCELED`. They are deliberately
different from protocol and browser networking states. The authoritative mapping and precedence rules
are in [TRANSFER-STATE-MAPPING.md](TRANSFER-STATE-MAPPING.md).

Normal product copy must not reveal ICE, SDP, TURN allocation, block acknowledgements, SHA state, or
RTCDataChannel details.

## Resume And Completion Contract

**Resume:** “Verified progress” is the receiver-persisted portion that FlickSend knows does not need to
be sent again. It is not a promise that every interruption, browser restart, sleep event, destination,
or source can recover. On a supported interruption, show that verified progress is safe, reconnect, and
continue missing work. If recovery cannot proceed, show a clear next action rather than low-level errors.

**Completion:** Product-visible `COMPLETED` means the engine has reached `DELIVERED`; the receiver's
required integrity and destination-finalization conditions have succeeded. A hash mismatch, missing or
unverified block, missing/mismatched manifest root, exhausted integrity retries, or destination
finalization failure cannot produce Completed.

The ordinary UI should use one understandable progress presentation with verified-progress messaging;
P4/P8 decide its final visual treatment.

## Transfer Health And SpeedProof

Transfer Health is advisory only. It cannot affect integrity, recovery correctness, or the `DELIVERED`
gate. When evidence supports it, product UI may say “Connection looks good,” “Connection is unstable,”
“Transfer appears limited by your connection,” “Transfer appears limited by source storage,” or
“Transfer appears limited by destination storage.” It uses “Not enough information yet,” not internal
`INSUFFICIENT_DATA` terminology, when evidence is insufficient.

SpeedProof is a transfer summary/diagnostic concept, not a certified internet benchmark. It may show
size, duration, average/peak speed, route category where useful, reconnects, retries, and verified
completion. It must not turn same-host development evidence into a customer performance guarantee.

## History, Notifications, And Settings

History retains metadata, never normal payload. A planned transfer record is sender/recipient,
direction, created/completed times, total size, file/folder count where available, status, verified
completion, route summary, reconnect count, integrity retry count, and SpeedProof summary. History does
not require full directory trees, full local paths, or payload content. Whether a display name is stored
must be decided through data minimization in P15.

Notification needs are invitation, transfer waiting, started, completed, failed, and security/account
events. V1 does not send noisy per-progress notifications. Settings remain limited to Account,
device/session security, notifications, privacy, appearance, and necessary transfer preferences; users
do not tune frame size, buffers, TURN mode, block size, or WebRTC settings.

## Privacy, Security, And Accessibility

Product principles are to collect only operational metadata; never log payload contents, full local
paths by default, secrets, or credentials; separate diagnostics from content; and use privacy-safe
transfer metadata. Normal payload is not application-database storage.

Authorization matters. Invitations cannot reveal arbitrary private transfers; guests have bounded
access; People does not confer authorization; abuse/rate controls are required; and integrity gates
completion. Application-layer payload encryption is not a qualified feature and must not be marketed as
FlickSend end-to-end encryption, zero knowledge, or military-grade encryption.

All later V1 UX targets WCAG 2.2 AA: keyboard operation, visible focus, semantics, reduced motion,
adequate targets/contrast, non-drag alternatives, accessible progress/status, errors, and
authentication. Desktop Windows is the qualified transfer environment; responsive account, marketing,
and basic recipient UI does not imply mobile transfer support.

## Claims Policy

Allowed positioning is browser-first person-to-person handoff, huge files/folders by design, direct
when possible, verified continuity for supported recovery, folder fidelity, and clear transfer health.
Claims must follow [PRODUCT-CLAIMS.md](PRODUCT-CLAIMS.md) and
[PERFORMANCE-CLAIMS.md](PERFORMANCE-CLAIMS.md).

V1 must not claim universal browser/device/Mac/mobile support, gigabit or utilization results, fastest
transfer, competitor speed superiority, offline delivery, cloud storage, background transfer, browser
restart persistence, or application-layer payload encryption.

## Tone, Visual Direction, And Competitive Framing

Product writing is plain, calm, short, human, confident, and non-technical. It does not give false
reassurance when correctness is unknown. Prefer “Reconnecting... Your verified progress is safe.” over
network-protocol language.

Later visual work should be modern, minimal, fast-feeling, high-trust, spacious, and professional
creative-tool quality. It must avoid enterprise-dashboard clutter, gaming or crypto aesthetics,
excessive glassmorphism, over-animation, and generic dashboard overload. P3 owns the design system;
P1 creates no UI.

Competitive framing is category-level only. WeTransfer represents a cloud-link mental model; Blip a
direct-transfer native-app model; MASV mature cloud/professional transfer workflows; Resilio a
device/folder-sync model. FlickSend is a person-centric browser-first handoff with verified continuity,
folder fidelity, and clear transfer health. P1 makes no feature, pricing, performance, or superiority
claim about competitors.

## Known Limitations

- Real external Windows picker qualification: `DEFERRED / ACCEPTED PRODUCT RISK`.
- Two-machine physical network qualification: `DEFERRED / ACCEPTED PRODUCT RISK`.
- macOS and mobile compatibility: `DEFERRED` and `NOT_YET_QUALIFIED`.
- Physical TURN performance and production TURN deployment: `DEFERRED`.
- Offline/asynchronous delivery, Mesh, Turbo/native acceleration, and application-layer encryption:
  not V1.
- Refresh/restart persistence and hidden-tab behavior are not V1 promises.

## V1 Inclusions

- Single-file and UX-supported multiple-file sending.
- Folder sending with StreamPack hierarchy preservation.
- Person-centric sending, authorized guest receiving, People, send again, and basic transfer history.
- Direct WebRTC routing with relay fallback.
- Verified integrity, verified resume, transfer/recovery progress, Transfer Health, SpeedProof, and
  verified completion.
- Browser capability handling, clear error UX, and privacy-conscious diagnostics.

## V1 Exclusions

- Cloud drive, cloud payload library, offline/asynchronous delivery, sync, backup, editing,
  collaboration, comments, team workspaces, DAM, or content-preview platform.
- Mobile-first professional transfer, guaranteed background/mobile/while-asleep transfer, Mesh, Turbo,
  native desktop application, WebTransport relay, third-party integrations, API platform, enterprise
  SSO/SCIM/admin/compliance suite, or application-layer payload encryption.
- Global content/payload search, general ZIP compression controls, technical transfer tuning, and
  unsupported competitor speed claims.

## Success Definition

The core V1 success event is: a sender sends the intended files or folder to the intended recipient,
and that recipient receives a verified complete destination. The north-star candidate is **verified
recipient-completed transfers**.

Supporting future funnel metrics are send initiated, recipient selected, source selected, session
established, recipient connected, first payload byte, verified progress, recovery occurred, transfer
completed, recipient completed, and send again. Product optimization must prioritize completion,
time to successful first send, recovery success, recipient completion, repeat senders, and
recipient-to-sender conversion, not upload volume.

## Golden-Path Acceptance Scenarios

| Scenario               | Acceptance outcome                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Send a file            | A signed-in sender chooses a person and file, the recipient accepts, and both see verified completion.                         |
| Send a large folder    | A sender chooses a folder, hierarchy is summarized, the recipient accepts, and the exact verified hierarchy completes.         |
| Supported interruption | An active transfer reconnects after interruption, preserves verified progress, continues missing work, and completes verified. |
| Terminal failure       | A source, destination, network, or integrity terminal error never shows completion and gives a useful next action.             |
| Guest recipient        | An authorized guest opens, accepts, and receives the intended transfer without access to unrelated account information.        |

## Future Boundaries

P2 owns brand/domain/legal clearance. P3-P8 own product design and implementation; P10 owns
authentication; later phases own data, billing, notifications, security governance, analytics, and
operations. No P2+ implementation is part of this document.
