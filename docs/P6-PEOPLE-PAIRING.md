# P6 People & Pairing

## Purpose

People is FlickSend's lightweight person-to-person relationship layer. Its product meaning is: "I know this
person on FlickSend, so I can select them again when sending." It is not an address book, social graph, chat
system, user directory, CRM, workspace, or transfer history.

P6 supplies relationship eligibility for future sends. It does not authorize payload access, replace transfer
session authorization, or control FSTP, WebRTC, integrity, recovery, StreamPack, destination handling, or
`DELIVERED` completion.

## Identity Model

`PersonIdentity.id` is an opaque synthetic application ID and is the sole relationship key. Display names,
initials, avatars, and presence are presentation metadata only. P6 fixture identities are synthetic:
`Development sender`, `Alex Morgan`, `Jordan Lee`, `Taylor Chen`, `Morgan Reed`, and
`Elodie van der Berg-Luczak`.

P6 does not use emails, usernames, contacts, filesystem paths, transfer IDs, session codes, transport IDs, or
WebRTC data as relationship identity.

## Development Boundary

```text
P6 DEVELOPMENT PEOPLE STORE
NOT PRODUCTION ACCOUNT/DATABASE PERSISTENCE

P6 DEVELOPMENT PAIRING MECHANISM
NOT PRODUCTION INVITATION SECURITY
```

The Engine Lab uses a process-local server fixture store only so deterministic browser contexts can exercise a
real application flow. It contains minimal synthetic relationship metadata and expires from process memory. It
is unavailable in production builds. P10 owns production authentication, P11 owns database persistence, and
later platform work owns production invitation authorization.

The development store never holds payload bytes, filenames, transfer history, filesystem paths, IP addresses,
network details, WebRTC details, analytics, contact data, or credentials.

## Pairing

1. A person creates one opaque, short-lived development pairing code.
2. Another synthetic identity enters that code explicitly.
3. The owner sees an outgoing invitation; the redeemer sees an incoming invitation.
4. The recipient accepts to create one `CONNECTED` relationship, or declines to remove the pending state.

Codes are not shown in People lists, are not logged, expire after 15 minutes, are consumed on redemption, and
are never derived from transfer/session/transport identities. Repeated code creation returns the same active
code instead of creating duplicate pending code state.

Invalid or expired codes render generic `FS-PRODUCT-PEOPLE-INVITE-INVALID` copy and do not disclose whether a
person, relationship, or People record exists.

## Relationship Behavior

The authoritative states are `UNCONNECTED`, `INVITED_OUTGOING`, `INVITED_INCOMING`, `CONNECTED`, and `BLOCKED`.
There is one logical relationship per unordered opaque-ID pair.

- Accepting an incoming invitation transitions exactly once to `CONNECTED`; repeated accepts are idempotent.
- Declining removes the pending relationship. It is neither blocking nor failure.
- A repeated redemption for the same invitation does not create a second relationship row.
- If A and B each create a code and redeem the other's code, the inverse pending invitations converge
  deterministically to one `CONNECTED` relationship.
- A person cannot redeem their own code.
- Removing changes `CONNECTED` to `UNCONNECTED` and does not imply transfer-history deletion.
- Blocking ends or prevents a relationship and prevents ordinary future pairing and Send eligibility.
- Unblocking changes `BLOCKED` to `UNCONNECTED`; it never reconnects people automatically.

## Presence

Fixture presence is advisory only. `available`, `unavailable`, and `unknown` are displayed distinctly; unknown is
not treated as unavailable. Presence does not make a pending or blocked relationship eligible for Send and does
not imply a production presence backend.

## Send Integration

`/send` receives only `CONNECTED` People from the P6 provider. Connected people are selectable even when their
presence is unknown. Pending and blocked relationships are not selectable and cannot be preselected through the
normal query-driven entry point. The P4 sender controller independently rejects an ID outside the current
eligible People source and clears an ineligible pre-start selection.

The People `Send` action navigates to the existing P4 route with an opaque person ID preselected. It does not
create a second send flow or alter source preparation, session creation, transport, resume, integrity, or
delivery behavior. Isolated P4 test fixtures remain available to P4 tests.

## Active Transfer Isolation

People is future-send eligibility only. If a relationship is removed or blocked after a legitimate transfer has
started, the active transfer continues under the existing FSTP/engine lifecycle. P6 never silently cancels,
corrupts, completes, or fails that transfer. An explicit existing transfer cancellation action remains the only
product cancellation path.

## Accessibility And Responsive Behavior

The People route reuses P3 `AppShell`, `PersonRow`, `Avatar`, `PresenceIndicator`, `Dialog`, `ConfirmDialog`,
`Button`, `EmptyState`, and error presentation primitives. Person-specific accessible names identify Send,
Accept, Decline, Manage, Remove, Block, and Unblock actions. Remove and Block require confirmation; routine
Accept and Send do not.

Browser qualification covers keyboard operation and no horizontal overflow at 1440, 1280, 1024, 768, and 390
CSS pixels, including a long Unicode-safe display name with unknown presence. The 390-pixel result is layout
evidence only, not mobile transfer qualification.

## Scope Boundary

P6 does not implement global discovery, contact import, QR pairing, email invitations, analytics, real accounts,
production authentication, production persistence, production invitation security, transfer history, advanced
recovery UX, production TURN, offline delivery, Mesh, Turbo, native applications, billing, marketing, or team
features.
