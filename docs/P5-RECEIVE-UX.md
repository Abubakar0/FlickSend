# P5 Receive UX

## Purpose

P5 provides the recipient-side Engine Lab journey at `/receive/[session]`. It authorizes a session before
revealing incoming metadata, lets the recipient explicitly accept or decline, prepares one safe browser
destination, and presents only the existing engine's authoritative lifecycle. FlickSend remains an internal
working brand under `CONTINUE_PENDING_COUNSEL`.

## Authorization And Privacy Boundary

`ReceiveSessionController` normalizes the route value with the protocol session-code parser, joins the existing
signaling session, and waits for an engine `READY` offer. Before that offer is accepted, the route renders only
generic opening, waiting, or unavailable copy. A malformed, expired, unknown, or unauthorized session maps to
the same generic `FS-PRODUCT-AUTH-UNAUTHORIZED` presentation; it discloses no sender, source name, count,
size, path, transfer ID, route detail, or reason for rejection.

```text
P5 DEVELOPMENT AUTHORIZATION / SESSION FIXTURE NOT PRODUCTION INVITATION SECURITY
```

The local Engine Lab fixture supplies the authorized sender display name `Alex Morgan`. It is deterministic
integration infrastructure, not an identity claim, account, People relationship, guest-link policy, or production
invitation implementation. P5 makes no claim that the fixture authorizes a production recipient.

## Recipient Journey

1. `/receive/[session]` opens and authorizes the existing signaling/engine session without showing offer metadata.
2. A valid engine offer reaches `REVIEWING`; the recipient sees the fixture sender, a bounded source summary,
   and explicit `Accept` and `Decline` actions.
3. `Accept` reaches destination selection. The recipient can use the native save-file picker for an M5 single
   file or the native directory picker for an M6 StreamPack source. Browser picker availability is capability
   checked; there is no Blob, Base64, archive, or giant-memory fallback.
4. After destination preparation, `Receive` calls the existing `acceptIncomingFile` or `acceptIncomingFolder`
   engine entry point. Payload never passes through a FlickSend application API or React state.
5. The active screen derives received bytes, receiver-safe verified progress, conservative health, ETA, and the
   safe `Direct`/`Relayed` route label from engine snapshots.
6. Recoverable interruption is `RECONNECTING`: the same transfer and prepared destination remain active, and
   the UI says verified progress is safe. P5 does not implement FSTP resume, manifest validation, StreamPack,
   integrity, or route recovery.
7. An authorized recipient whose prepared sender is temporarily unavailable enters nonterminal
   `WAITING_FOR_SENDER`; the prepared destination remains bound to the same active transfer. A matching engine
   reconnection returns the recipient to `READY_TO_RECEIVE`, then the normal engine receive flow continues.
8. Product completion occurs only for `DELIVERED` from the active transfer identity. Byte progress, a drained
   data channel, React reaching 100%, or local destination writes cannot create a completion card.

The current M6 pre-accept offer does not expose a folder title or tree/counts. P5 therefore uses the bounded
neutral label `Shared folder` until authoritative StreamPack progress exposes counts after acceptance. It never
guesses a path, tree, or count before that point.

## Destination And Recovery Rules

The browser destination adapter owns native picker APIs and metadata-only OPFS recovery storage. It creates an
opaque destination identity and never renders or records the browser's full path. The controller revision-gates
asynchronous destination preparation: changing the requested destination aborts and ignores stale preparation.
It does not send payload before a destination is prepared.

During recovery, the existing receiver-authoritative engine validates committed StreamPack state and destination
content. A destination mutation fails safely through the stable product mapping
`FS-PRODUCT-DESTINATION-CHANGED`; it cannot become `COMPLETED`. Verified committed blocks survive resume and
are not resent unless the engine identifies a correctness reason.

Real external Windows save/directory picker evidence remains `DEFERRED / ACCEPTED PRODUCT RISK` under M9. The
development-only bounded fixture destination exists only to qualify P5 browser/engine integration. It is not a
production destination, persistence mechanism, or fallback for browsers without the required native capability.

## Errors, Cancellation, And Accessibility

`receive-state.ts` maps known engine and browser errors to the frozen product taxonomy without exposing raw
engine codes in ordinary UI. The mapping recognizes the engine's internal unprefixed codes and adapter-facing
`FS_*` codes at the controller boundary. Integrity exhaustion, manifest/digest failure, destination finalization
failure, source/destination mutation, recovery exhaustion, browser capability failure, and service failure are
all terminal or action-required as appropriate; none can display completion.

The deterministic P5 browser closeout drives the existing bounded integrity-retry exhaustion mechanism through the
real recipient surface. It maps to `FS-PRODUCT-INTEGRITY-FAILED`, displays a product integrity error, and cannot
render `COMPLETED` or `Received and verified`.

Cancellation is available only while a transfer is active and is confirmed with an accessible alert dialog. It is
represented as `CANCELED`, not failure or completion. P5 does not claim partial data is deleted and does not add
pause, persistence across browser restart, background transfers, offline delivery, or recovery UI beyond the
existing engine's correctness lifecycle.

The route uses semantic headings, named actions, a polite status region, terminal focus, keyboard-operable
accept/decline, native picker actions, and cancellation confirmation. Browser evidence covers 1440, 1280, 1024,
768, and 390 CSS-pixel review widths without horizontal overflow. The 390-pixel case is layout evidence only,
not mobile-platform transfer qualification.

## Scope Boundary

P5 does not start P6 People, P7 history, P8 recovery expansion, P9 accessibility audit, P10 authentication,
production accounts/database/invitation authorization, billing, marketing, SEO, production TURN, Mesh, Turbo,
offline delivery, native applications, or application-layer payload encryption.
