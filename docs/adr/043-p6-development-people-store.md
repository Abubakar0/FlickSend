# ADR 043: Use A Shared Development-Only People Repository For P6 Qualification

## Status

Accepted for P6 Engine Lab qualification only.

## Context

P6 must prove a real person-to-person pairing journey across independent browser contexts: create a pairing code,
redeem it, accept it, and expose the resulting connection to the existing Send route. A browser-local fixture
cannot safely represent both identities across independent contexts. Production authentication and database
persistence are explicitly deferred to P10 and P11.

## Decision

Use a process-local server development store behind a narrow application repository interface. The store contains
only synthetic opaque identities, relationship state, and short-lived single-use development pairing codes. It is
disabled in production runtime, holds no payload data, and is not described as account, database, or invitation
security infrastructure.

The People controller uses request revisions plus an opaque client instance ID to reject stale mutation results.
Relationship storage is keyed by an unordered pair of opaque person IDs; display names never identify a record.

## Consequences

P6 can run deterministic real-browser relationship integration tests without introducing Prisma, account tables,
authentication, global user discovery, contact harvesting, or production public-link behavior. The repository
interface is intentionally independent of a future database schema.

The store is ephemeral and is not a persistence or security claim. Production identity, authorization, invite
delivery, durable data, audit, abuse controls, and discovery require later explicit design and qualification.
