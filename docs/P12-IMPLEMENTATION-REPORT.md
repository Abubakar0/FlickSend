# P12 Implementation Report

## Scope

P12 adds the production foundation for authenticated People invitations and bounded signaling control-plane admission. It does not change FSTP transfer semantics, payload transport, integrity, StreamPack, resume, route selection, delivery mapping, application-layer encryption, production TURN deployment, or any P13+ scope.

## Implemented

- PostgreSQL `Invitation` lifecycle with committed Prisma migration, digest-only bearer-token storage, seven-day expiry, opaque public IDs, bounded listing, inviter-scoped revocation, and generic public failure behavior.
- Serializable invitation acceptance with retry handling, self/block protection, replay resistance, canonical People relationship convergence, cross-invitation handling, and concurrent acceptance protection.
- A public `/invite/[token]` response route and authenticated People invitation panel. The raw link is presented only immediately after creation and is not retained by the list API or UI state after the dialog closes.
- Server-authorized connected-People signaling-session issuance. Sender and receiver receive separate ten-minute role-bound capabilities; neither PostgreSQL nor the capability claims contain a transfer identity or payload metadata.
- Cloudflare Worker `v2` signaling admission with HMAC capability verification and a `ProductionSessionRoom` Durable Object using WebSocket hibernation. The room is bounded to one active sender and one active receiver, validates bounded protocol messages, supports same-role socket replacement/rejoin, expiry, and capability-authenticated revocation.
- A narrow `engine-core` signaling admission seam. It selects the authorized WebSocket path only; FSTP transfer identity, resume, M5 integrity, M6 StreamPack, and `DELIVERED` semantics remain unchanged.

## P12 Qualification Evidence

The canonical command is `pnpm qualification:p12`. It provisions only the fixed loopback Docker PostgreSQL fixture, applies committed migrations, executes retained P11 and P12 persistence tests serially, then runs the WebSocket qualification. It refuses a non-local `DATABASE_URL`.

The current-source real-infrastructure qualification used a temporary Cloudflare preview Worker with the `ProductionSessionRoom` Durable Object and two real `ws` clients. It passed these 12 cases: authorized sender join; duplicate sender socket replacement; authorized receiver join; SDP offer relay; ICE candidate relay; tampered third-client rejection; same-capability reconnect; malformed JSON rejection; oversized-message rejection; revocation and rejected rejoin; expiry cleanup; bounded two-peer completion.

This is valid Worker/Durable Object/WebSocket qualification evidence. It is not a persistent staging or production deployment claim. The temporary preview URL, version, claim token, and test signing value are intentionally not retained in this report.

The P12 persistence qualification applied both committed migrations and passed all 10 retained P11/P12 PostgreSQL integration tests. Focused source checks passed: signaling typecheck and five signaling unit tests; full engine-core suite with 49 tests, including the P12 signaling reconnect transfer-identity assertion; and Engine Lab typecheck.

## Security And Privacy

The raw invitation token is never stored in PostgreSQL. The raw signaling capability is verified in the Worker and removed before Durable Object routing; the Durable Object stores only hibernation role/expiry attachments and short-lived revocation state. No P12 database row, Worker log path, or Durable Object state may contain payload, filenames, paths, manifests, block hashes, Account/provider identifiers in public responses, transfer IDs, SDP, ICE, database credentials, TURN credentials, or raw capability values.

Connected People eligibility gates only issuance of a new sender signaling capability. It does not by itself authorize arbitrary rooms or payload. A P5 receiver capability remains a bounded guest signaling admission token; it does not make a guest an Account or replace P5/engine delivery authorization.

## Final Verification

All commands used the workspace Node 24.19.0 runtime required by `package.json`.

| Command                  | Actual result                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`      | PASS                                                                                                                                                               |
| `pnpm typecheck`         | PASS: 27 Turbo tasks                                                                                                                                               |
| `pnpm lint`              | PASS: 15 Turbo tasks                                                                                                                                               |
| `pnpm test`              | PASS: 26 Turbo tasks; the default suite intentionally gates 10 PostgreSQL tests, which are executed by the P12 qualification                                       |
| `pnpm test:e2e`          | PASS: Playwright persisted `status: passed` for 89 configured Chromium tests; existing environment-gated qualification scenarios retain their normal skip behavior |
| `pnpm build`             | PASS: 15 Turbo tasks, including the Worker dry-run bundle and Next production build                                                                                |
| `pnpm qualification:p12` | PASS: fixed local PostgreSQL migration/10 P11-P12 integration tests plus 12 real temporary Cloudflare Worker/Durable Object/WebSocket cases                        |

The first production build exposed a server/client UI import boundary in `/invite/[token]`. P12 corrected it by retaining server-side invitation inspection and authentication while moving presentation behind a client component; the rerun production build, typecheck, lint, and unit suite passed.

## Final Status

```text
P12 PRODUCTION INVITATIONS & SIGNALING INFRASTRUCTURE: COMPLETE
P12 FINAL VERIFICATION: PASS
PRODUCTION PAIRING & SIGNALING FOUNDATION: FROZEN

NEXT PHASE: P13
```

## Deferred And Out Of Scope

- Permanent Cloudflare staging/production Worker ownership, DNS, operations, monitoring, retention, and incident process.
- Production TURN deployment and throughput qualification.
- Application-layer payload encryption, offline delivery, Mesh, Turbo, billing, analytics, email delivery, global discovery, account deletion, and retention policy.
- P13 and all later product phases.
