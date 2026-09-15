# P11 Data Model

## Authority

PostgreSQL stores durable FlickSend application metadata. It is not a payload store, transfer-correctness engine,
recipient authorization service, signaling service, or recovery authority.

## Account

Purpose: maps one authenticated Clerk provider subject to one opaque FlickSend account ID.

Fields: opaque UUID `id`, `authProvider`, private `providerSubject`, optional presentation-only `displayName`, and
UTC `createdAt`/`updatedAt` timestamps.

Constraints and indexes: unique `(authProvider, providerSubject)` prevents duplicate account provisioning. Display
name is neither unique nor authority. Email is intentionally absent.

Privacy: `providerSubject` is private server mapping data and never becomes a DTO, URL, People identity, history
field, support reference, or UI value. Account IDs are opaque product identifiers only where a peer must be resolved.

Relationships: an Account can be a canonical low or high People participant, a P6 lifecycle actor, a history owner,
or a history peer. Every foreign key is restrictive: P11 does not implement account-data deletion or cascades.

## PersonRelationship

Purpose: retains the frozen P6 relationship lifecycle between two FlickSend accounts.

Fields: opaque UUID `id`, canonical `accountLowId`/`accountHighId`, preserved P6 lifecycle actor IDs for legacy
invited or blocked state, status, and UTC timestamps. P11 adds no production invitation or pairing creation flow.

Constraints and indexes: a unique canonical pair ensures A/B and B/A converge to one row. A database check rejects
self pairs and invalid state actor combinations. Foreign keys are `RESTRICT`; P11 deliberately has no account-delete
cascade. Per-account ordered indexes support bounded People listings.

Privacy: People DTOs expose only the other opaque account ID, cached display name, unknown presence, relationship
state, and update timestamp. No email, provider subject, pair key, pairing secret, payload, or network data exists.

Relationships: each row has exactly two Account participants. Optional lifecycle actor fields remain private schema
state to preserve P6 semantics; P11 exposes no production invite-creation route.

## TransferRecord

Purpose: durable P7 observational history owned by one Account.

Fields: opaque UUID `id` as product record ID; private opaque P7 `lifecycleKey` used only to coalesce automatic
recovery; owner and optional peer account IDs; direction, product status, source category; total size and counts;
safe failure category; bounded active metadata; safe SpeedProof summary; revision; and UTC timestamps.

Constraints and indexes: `(ownerAccountId, lifecycleKey)` is unique; owner/order and owner/record indexes support
bounded deterministic list/detail access. `BIGINT` stores total bytes safely beyond normal JavaScript file sizes;
the application accepts only JavaScript-safe values for current browser DTOs. Integer counters and revision are
non-negative. A trigger preserves terminal `COMPLETED`, `FAILED`, and `CANCELED` rows against stale mutation.

Privacy: no filename, folder name, path, payload, manifest, tree, digest, engine ID, signaling ID, browser handle,
network identifier, credential, raw diagnostic, or raw error column exists. The two JSON fields are explicitly
validated, metadata-only projections of existing P7/M8 safe DTOs; unknown client properties are discarded.

Relationships: every record has one required Account owner and may have one P6 opaque peer. History ownership is
always checked server-side; an application record ID alone is not authorization.

## Explicitly Prohibited Data

No P11 table stores file contents, payload chunks, recovery block maps, destination handles, Clerk tokens, email,
production invitations, SDP, ICE candidates, TURN credentials, analytics events, retention/deletion policy data, or
backup metadata.
