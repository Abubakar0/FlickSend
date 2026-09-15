# P11 Implementation Report

## Status

```text
P11 PRODUCTION DATABASE & PERSISTENCE: COMPLETE
P11 FINAL VERIFICATION: PASS
PERSISTENCE FOUNDATION: FROZEN
```

## Objective

P11 replaces real-account P6/P7 process-local storage with durable PostgreSQL metadata persistence for account
mapping, People relationships, and observational transfer history. It does not change FSTP, WebRTC, StreamPack,
integrity, resume, routing, filesystem writing, or `DELIVERED` semantics.

## Architecture

`@flicksend/database` owns the PostgreSQL Prisma schema, committed migrations, and server-only Prisma client.
Engine Lab server services map the server-authenticated P10 `AuthPrincipal` to an opaque Account, authorize and
validate a repository operation, then return an explicit safe DTO. React components and engine packages do not make
raw Prisma queries. `engine-core` has no database dependency or database import.

## Railway And PostgreSQL Setup

Production accepts an injected `DATABASE_URL`; the connection contract is Railway-compatible without Railway APIs,
hostnames, project IDs, or credentials in source. The verified P11 environment was a controlled loopback Docker
PostgreSQL 17 instance, not a Railway staging or production database. Production backup/restore, pooling scale, and
disaster recovery are not qualified.

## Database Stack And Schema

The locked stack is PostgreSQL, Prisma `7.10.0`, `@prisma/adapter-pg` `7.10.0`, `pg` `8.23.0`, and TypeScript.
Prisma 8 was a release candidate at implementation time, so the current compatible stable Prisma 7 release was
selected. The committed initial migration creates:

- `Account`: opaque UUID, Clerk provider mapping, optional presentation-only display name, UTC timestamps, and a
  unique provider mapping. Email is absent.
- `PersonRelationship`: a canonical unordered Account pair, frozen P6 state metadata, restrictive foreign keys,
  canonical-pair/self protections, and bounded listing indexes.
- `TransferRecord`: owner-scoped P7-safe metadata, a unique owner/lifecycle key for automatic recovery, `BIGINT`
  total sizes, validated bounded JSON summaries, deterministic indexes, and a terminal-row trigger.

The detailed data model is in [P11-DATA-MODEL.md](P11-DATA-MODEL.md), package scope is in
[P11-PERSISTENCE-BOUNDARIES.md](P11-PERSISTENCE-BOUNDARIES.md), and ADR 047 records the decision.

## Accounts, People, And History

`resolveOrProvisionAccount` uses the database unique mapping and upsert/re-read behavior, so concurrent first
requests resolve to one opaque FlickSend Account. A display-name change or email change retains the same account.
Provider subjects remain private to the server mapping.

Persistent People preserves connected, blocked, remove, unblock, accept, and decline P6 semantics without exposing
production pairing creation. A new real account truthfully has no connections until a later P12-authorized process
creates one. Only connected People are returned as Send-eligible; blocked People are excluded. Relationship changes
do not control an existing transfer.

Persistent transfer history is owner-scoped and observational. Automatic recovery coalesces to its existing
application record, while a new attempt has a new opaque record. `COMPLETED` requires an explicit engine-backed
delivery confirmation; `FAILED` and `CANCELED` remain distinct. Late events cannot reopen a terminal record.

## Privacy, Authorization, And Operations

No payload, filename, path, manifest, tree, digest, engine ID, session ID, browser handle, network data, TURN
credential, raw error, email, or provider subject is returned in product DTOs or stored in history. Unknown client
properties are discarded before persistence. A P11 row inspection proves the exclusion for filename, path, engine,
and session fields. Live Clerk qualification also proves the provider subject is absent from the authenticated DOM.

Server route handlers resolve the current account from the server session and ignore client owner/current-person
claims. Cross-account history reads return no record, and a caller can only change its own relationship pair.
People reads are bounded to 100; history lists are newest-first, default to 50, and cap at 100. No list or detail
operation has an obvious N+1 query.

An absent or unavailable database does not activate development repositories or show a false empty state. It
produces a safe unavailable presentation/API category with no SQL, schema, connection, host, credential, or Prisma
detail. The test reset accepts only its fixed loopback URL before removing its named Docker volume.

## Migrations And PostgreSQL Qualification

The committed migration is
`packages/db/prisma/migrations/20260914000000_p11_metadata_foundation/migration.sql`. Production deployment uses
`pnpm --filter @flicksend/database migrate:deploy`; `prisma db push` is not an approved deployment path. The
full operational procedure and expand/migrate/contract policy are in [P11-MIGRATION-PLAN.md](P11-MIGRATION-PLAN.md).

`pnpm qualification:p11` recreated only the guarded loopback PostgreSQL database, waited for health, applied one
committed migration, and passed all five PostgreSQL integration cases. They cover fresh migration, insert/read/update,
transactions, provider uniqueness, two-client concurrent provisioning, cross-direction relationship uniqueness,
self/foreign-key rejection, block/remove/unblock behavior, owner scoping, delivery-only completion, distinct
terminal results, automatic recovery identity, concurrent lifecycle arbitration, terminal trigger protection, bounded
listing, client restart persistence, privacy inspection, and absent-client safe failure.

Restart evidence is a disconnect/recreate of the Prisma client against the same migrated database, followed by
successful People and history reads. This proves database-backed repository state rather than module memory; P11
does not claim a production multi-process load or deployment-scale qualification.

## Accessibility And Responsive UX

The retained P9 fixture suite passed. The P11 authenticated live checks cover populated authenticated route
rendering and the database-unavailable state. The persistent pages reuse frozen P3/P9 presentation primitives; P11
makes no mobile-platform, external-picker, Safari, or WCAG certification claim.

## P4-P10 Regression And Engine Decision

The fixture browser suite passed with 89 configured tests: 71 executed/passed, 18 explicitly environment-gated
qualification cases skipped, and zero failures. Retained configured product cases were P4 7, P5 10, P6 6, P7 7,
P8 12, P9 7, and P10 5. Two live Clerk runs also passed: one against the local PostgreSQL database and one with no
`DATABASE_URL`, each with 2 passing tests. Guest Receive remained public and independent of account persistence.

P11 changes no engine package or engine correctness behavior. Therefore:

```text
M4-M10 DEDICATED QUALIFICATION: NOT RERUN — NO ENGINE CORRECTNESS CHANGE
```

## Repository Verification

```text
pnpm format:check: PASS
pnpm typecheck: PASS (27 Turbo tasks)
pnpm lint: PASS (15 Turbo tasks)
pnpm test: PASS (26 Turbo tasks; Engine Lab 57 passed, 5 guarded PostgreSQL tests skipped)
pnpm qualification:p11: PASS (1 migrated PostgreSQL database; 5 integration tests)
pnpm test:e2e: PASS (89 configured; 71 passed; 18 gated skipped; 0 failed)
pnpm test:e2e:clerk with local PostgreSQL: PASS (2 passed)
pnpm test:e2e:clerk without DATABASE_URL: PASS (2 passed)
pnpm build: PASS (15 Turbo tasks)
```

The live Clerk runs emitted a Windows Node/libuv asynchronous-handle assertion during web-server teardown, but both
processes exited with code `0` and all four tests passed. It is retained as environment/runtime output, not treated as
a product qualification failure.

## Security Review

The P11 review confirms parameterized Prisma operations, no raw SQL from client input, no sensitive query logging,
server-side account authority, opaque public identifiers, restrictive foreign keys, explicit validated enums/counters,
UTC database timestamps, bounded reads, and explicit metadata allowlists. See
[P11-DATABASE-SECURITY-PRIVACY.md](P11-DATABASE-SECURITY-PRIVACY.md).

## Known Limitations And Deferred Work

```text
Production invitations, pairing delivery, and signaling infrastructure: P12
Account/product-data deletion: P15
Retention policy: DEFERRED
Production backup/restore qualification: NOT QUALIFIED
Production observability: P18
Analytics: P28
Billing: later phase
Production TURN: DEFERRED
Offline delivery: NOT V1
Background/sleep and refresh/restart transfer continuity: NOT QUALIFIED
Mac/mobile: NOT QUALIFIED
M9 external Windows picker: DEFERRED / ACCEPTED PRODUCT RISK
Railway staging/production PostgreSQL: NOT INDEPENDENTLY QUALIFIED
```

## Acceptance Matrix

| Requirement                                           | Result                              |
| ----------------------------------------------------- | ----------------------------------- |
| AGENTS P11 boundary and phase freeze                  | PASS                                |
| PostgreSQL/Prisma metadata persistence                | PASS                                |
| Committed migration and fresh migration               | PASS                                |
| Railway-compatible `DATABASE_URL` contract            | PASS                                |
| Controlled local PostgreSQL qualification             | PASS; Railway not independently run |
| Account mapping and concurrent provisioning           | PASS                                |
| Provider subject unique and private                   | PASS                                |
| Display name/email not account authority              | PASS                                |
| Persistent People and unordered pair uniqueness       | PASS                                |
| Self, block, remove, and unblock behavior             | PASS                                |
| Persistent Send eligibility/no fixture fallback       | PASS                                |
| Owner-scoped metadata-only transfer history           | PASS                                |
| Cross-account history and People mutation isolation   | PASS                                |
| No filename/path/engine/session persistence           | PASS                                |
| `DELIVERED`-only completion and terminal immutability | PASS                                |
| Recovery coalescing, retry identity, stale protection | PASS                                |
| Constraints, transactions, and bounded queries        | PASS                                |
| Restart persistence and test reset guard              | PASS                                |
| Database outage safe failure                          | PASS                                |
| P4-P10 regression and P10 live qualification          | PASS                                |
| No P12+ scope creep                                   | PASS                                |
| Repository verification                               | PASS                                |

## Next Phase

```text
P12 — PRODUCTION INVITATIONS & SIGNALING INFRASTRUCTURE
```

P12 remains not authorized until P11 receives external review and acceptance.
