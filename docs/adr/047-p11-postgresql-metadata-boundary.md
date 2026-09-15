# ADR 047: PostgreSQL Metadata Persistence Boundary

## Status

Accepted for P11 implementation; production rollout remains subject to external phase review.

## Context

P10 authenticates real users but intentionally has no durable FlickSend account, People, or transfer-history
database. P11 requires durable application metadata without allowing database concerns to influence FSTP,
integrity, recovery, routing, or payload transport.

## Decision

Use PostgreSQL with Prisma 7 through the server-only `@flicksend/database` workspace package. The package owns the
Prisma client, schema, and committed migrations. Engine packages stay database-independent. The application maps a
server-authenticated Clerk subject to an opaque Account UUID, then exposes server-authorized People and metadata
history repositories with safe DTOs.

The schema stores Accounts, canonical unordered People relationships, and owner-scoped transfer metadata only.
Database constraints and transactions enforce uniqueness, pair canonicalization, foreign keys, bounded safe values,
and terminal history immutability. `COMPLETED` continues to require the existing engine-backed delivery confirmation.

## Consequences

`DATABASE_URL` is deployment configuration, not product data. An unavailable database safely disables persistent
surfaces and never activates development fixtures. P11 does not add production invitations, signaling, payload
storage, retention, deletion, backups, analytics, billing, or observability. PostgreSQL is chosen for P11; no
Railway-specific code is introduced, though standard Railway PostgreSQL URLs are compatible.
