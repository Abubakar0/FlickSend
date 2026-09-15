# P11 Migration Plan

## Source Controlled Migration

The initial PostgreSQL schema is committed at
`packages/db/prisma/migrations/20260914000000_p11_metadata_foundation/migration.sql`. Prisma's migration lock
declares PostgreSQL. Schema changes must be introduced as reviewed, committed migrations; `prisma db push` is not
an approved deployment mechanism.

## Deployment Procedure

1. Set the deployment environment's private `DATABASE_URL` to the target PostgreSQL database.
2. Install locked workspace dependencies with `pnpm install --frozen-lockfile`.
3. Apply committed migrations with `pnpm --filter @flicksend/database migrate:deploy`.
4. Start the application only after migration deployment succeeds.
5. Confirm authenticated routes show a safe persistence-unavailable state rather than fixture data if the database
   is subsequently unavailable.

The application uses normal PostgreSQL connection URLs and has no Railway-specific deployment code. The local
qualification compose file is loopback-bound and test-only; it is not a production deployment definition. Apply the
same migration procedure to a Railway staging database before a production deployment. P11 qualified only local
Docker PostgreSQL, not a Railway staging or production instance.

## Rollout And Rollback

P11 uses an additive foundation migration on a fresh database. Future migrations must preserve forward
compatibility and require an explicit rollback or restore plan before destructive changes. P11 does not claim a
tested production rollback, backup, point-in-time recovery, retention policy, or restore procedure.

## Qualification

`pnpm qualification:p11` refuses an externally supplied database URL, recreates only the fixed loopback
PostgreSQL test database, applies the committed migration, and runs the database integration suite. It is evidence
for a fresh migration, constraints, privacy projections, owner scoping, bounded reads, concurrent account/lifecycle
operations, and restart persistence. It is not production hosting, backup/restore, P12 invitation, or physical
network qualification evidence.
