# ADR 048: Digest-Only Production Invitations

## Status

Accepted for P12.

## Context

P6 development pairing codes cannot provide durable production People invitation semantics. P12 needs a shareable link while minimizing the impact of application database disclosure and preserving P11 canonical relationship rules.

## Decision

Generate an opaque 32-byte random invitation token, expose it only as a one-time `/invite/<token>` path, and store only `SHA-256(token)` in PostgreSQL. Give the invitation a seven-day lifetime and explicit pending, accepted, declined, revoked, and expired lifecycle. Resolve all mutating authority from the server-authenticated Account. Accept within a serializable transaction and use the canonical unordered P11 PersonRelationship unique pair.

## Consequences

The database cannot recreate a usable invitation URL from the stored row. Token leakage before expiry remains bearer link risk, so the product must not log, analytics-capture, or redisplay the raw token. Email delivery, global discovery, contact import, account deletion, and retention policy are outside P12.
