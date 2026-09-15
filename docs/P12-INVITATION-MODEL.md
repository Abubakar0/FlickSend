# P12 Invitation Model

## Purpose

P12 replaces development pairing codes with a durable, authenticated People invitation. It creates a canonical P11 `PersonRelationship`; it never authorizes payload access, transfer delivery, signaling access to arbitrary sessions, or transfer metadata.

## Token And Storage

Creation generates 32 cryptographically random bytes and encodes them as `fsiv1_<base64url>`. The raw token appears only in the one-time create response as `/invite/<token>`. PostgreSQL stores `SHA-256(token)` as the unique `Invitation.tokenDigest`, never the raw token. Public invitation URLs contain no sequential identifier, provider subject, Account ID, relationship ID, transfer ID, or email.

Tokens have a seven-day lifetime. The server never logs a raw token, and the product does not retain it after the creation dialog closes. The invite page returns generic unavailable copy before and after sign-in when a token is malformed, unknown, expired, revoked, declined, or consumed. It exposes no inviter or People-graph metadata until normal product authorization permits it.

## Lifecycle

`PENDING` is the sole usable state. A pending invitation transitions once to `ACCEPTED`, `DECLINED`, `REVOKED`, or `EXPIRED`. `ACCEPTED` binds the authenticated recipient and creates or recognizes a canonical relationship. `DECLINED` binds the authenticated recipient. `REVOKED` is performed by the authenticated inviter using an opaque public invitation ID. `EXPIRED` is persisted when the server observes expiry before resolution or listing.

The database check constraint enforces the state-specific resolution timestamps and resolver relationship. All non-pending states are permanently unusable. Email delivery is deliberately deferred: P12 supplies a shareable FlickSend link only.

## Authorization And Concurrency

Every mutation first resolves the server-authenticated principal to the opaque P11 Account. Invite creation/listing is scoped to the inviter. Accept/decline binds the result to the recipient Account; revoke is scoped to the inviter. No client-supplied Account, provider subject, email, or relationship key is accepted as authority.

Acceptance uses a PostgreSQL serializable transaction with bounded retries for serialization and uniqueness conflicts. It rejects self-invites and blocked relationships. It finds or creates exactly one existing canonical unordered `PersonRelationship` pair. Cross invitations and multiple outstanding invitations converge to one `CONNECTED` row. Replays cannot create a second People row.

## Data Boundary

The `Invitation` table contains only opaque IDs, Account foreign keys, token digest, status, and lifecycle times. It stores no payload bytes, filenames, source/destination paths, manifests, block hashes, engine transfer IDs, signaling session/capability values, browser handles, provider tokens, or network diagnostics. A Connected People relationship is future Send eligibility only; transfer and payload authorization remain separate engine/session concerns.
