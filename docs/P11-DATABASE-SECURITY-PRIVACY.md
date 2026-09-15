# P11 Database Security And Privacy

## Connection And Deployment

Production supplies `DATABASE_URL` through the deployment environment. PostgreSQL is the only P11 datastore;
the URL is Railway-compatible but the application has no Railway SDK, API, deployment hook, or platform-specific
runtime dependency. It is never committed, logged, serialized, or exposed to browser code. A missing or failed
connection produces a generic persistence-unavailable product state and safe API category response. It never falls
back to fixture, browser, local-file, or in-memory production persistence.

## Data Minimization

Accounts retain a provider subject only for the server-side Clerk-to-FlickSend mapping, an opaque FlickSend UUID,
and an optional presentation name. Email is not stored. Provider subjects are never returned from the account
boundary. People and transfer APIs resolve the authenticated account on the server and return safe DTOs only.

Transfer history is metadata-only and deliberately has no schema field for payload, filename, directory or full
path, manifest, file tree, block digest, engine transfer ID, signaling/session ID, browser handle, raw error,
network address, ICE candidate, SDP, TURN credential, or analytics data. Validated JSON projections contain only
the existing safe active-transfer and SpeedProof summaries; unrecognized client properties are discarded.

## Authorization And Integrity

Client-supplied owner and current-person values are ignored by persistent repositories. Route handlers obtain the
principal from the server session, provision its opaque account mapping, and owner-scope all history detail/list
queries. A request for another account's record returns no record. People mutations only operate on the caller's
canonical pair with an existing opaque account; self-pairs and malformed target IDs are rejected.

Database constraints enforce unique provider mappings, canonical unordered People pairs, state actor consistency,
foreign keys, non-negative history values, and a unique `(ownerAccountId, lifecycleKey)` recovery key. A terminal
row trigger rejects late mutation of `COMPLETED`, `FAILED`, and `CANCELED` records. Application validation still
requires `deliveryConfirmed` before a `COMPLETED` write.

The controlled qualification reset rejects every supplied `DATABASE_URL` except its fixed loopback-only test URL
before removing its named Docker volume. It cannot target a Railway or other externally configured database.

## Operational Limits

People reads are bounded to 100 rows and transfer history reads default to 50, capped at 100, with deterministic
ordering. People list queries fetch both peer accounts in their single bounded query; history list/detail queries
are owner-scoped and do not issue per-row peer lookups. Prisma query logging is disabled. The Next.js client is
reused across development reloads, but durable authority is PostgreSQL rather than module memory. P11 makes no
connection-pool scale claim, backup, restore, retention, purge, account deletion, security-monitoring, or
observability qualification claim. Those concerns remain later authorized work.
