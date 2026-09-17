# P13 Implementation Report

## Repository Result

P13 production signaling deployment and operations implementation is complete in the repository:

- environment-separated Worker names, bindings, migrations, and exact origin configuration;
- secret-free Worker configuration with provider-managed capability secret instructions;
- bounded health, CORS, operation, rate-limit, and relay-eligibility behavior;
- deterministic local P13 qualification and staging dry-run validation; and
- operational, security, deployment, and environment-contract documentation.

## Qualification Evidence

- `pnpm qualification:p12`: PASS. The guarded local PostgreSQL fixture reset, one runner-setup
  test, ten P11/P12 persistence/invitation tests, and all twelve local Worker/Durable Object signaling
  cases passed.
- `pnpm qualification:p13`: repository checks PASS. The configuration contract has six passing tests,
  the signaling package has eighteen passing tests, and the staging Worker dry-run has the intended
  bindings and exact Railway staging origin.
- `pnpm qualification:p13-p14`: repository `PASS`; P13 and P14 external statuses remain `BLOCKED`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`: PASS. The serial unit suite reported
  28 successful Turbo tasks; `engine-core` reported 50 tests and Engine Lab reported 68 passed with
  10 intentionally environment-gated PostgreSQL tests skipped.
- `pnpm test:e2e`: 71 passed, 18 skipped, 0 failed, 89 configured. The skips are retained
  environment-gated physical, large-fixture, local-coturn, and lifecycle qualifications, not P13
  failures.
- `pnpm format:check`: FAILS on a pre-existing global baseline of 372 files. P13/P14 files touched in
  this work were separately formatted and checked. This report does not relabel the global formatting
  baseline as a P13 deployment or external-qualification failure.

### Retained P12 Local Evidence

P13 reran the retained P12 qualification after correcting its local Durable Object lifecycle harness.
The room reconstructs only role/expiry attachments across hibernation, emits one peer-joined
notification after replacement, and the local runner proves that the server initiates replacement,
revocation, and expiry closes. Local Workerd leaves the Node client in `CLOSING` rather than delivering
the full close event in these cases, so the runner terminates that client only for local cleanup. This
is not a claim about persistent Cloudflare close-handshake behavior; that evidence remains part of the
external P13 gate.

## External Evidence

**BLOCKED — PERSISTENT CLOUDFLARE STAGING QUALIFICATION NOT EXECUTED**

On 2026-09-16, Wrangler OAuth authentication completed for the intended Cloudflare account. After
Cloudflare account verification, the committed staging-only deployment command,
`pnpm --filter @flicksend/signaling exec wrangler deploy --env staging`, deployed
`flicksend-signaling-staging` successfully. The persistent Worker has the required
`SESSION_DIRECTORY`, `SESSION_ROOM`, and `PRODUCTION_SESSION_ROOM` Durable Object bindings. Its safe
health endpoint returned HTTP 200 with staging and `ok` status. This verifies deployment reachability,
not live signaling admission, recovery, or revocation behavior.

The Railway CLI is not installed in this environment and no Railway staging environment access is
available here. Cloudflare currently has no configured `SIGNALING_CAPABILITY_SECRET`. Consequently,
the staging `NEXT_PUBLIC_PRODUCTION_SIGNALING_URL` cannot yet be set on Railway and live signaling
cannot be configured safely. A secret must not be generated or rotated on just one side.

Manual actions remaining before the external gate can run:

1. Create or retrieve one approved high-entropy shared secret through an authorized Railway/secret
   management channel, then configure that identical value as server-only
   `SIGNALING_CAPABILITY_SECRET` in Railway staging and Cloudflare staging.
2. Set Railway staging `NEXT_PUBLIC_PRODUCTION_SIGNALING_URL` to the deployed persistent WSS endpoint,
   then redeploy only the staging Engine Lab service.
3. Run `FLICKSEND_P13_EXTERNAL=1 pnpm qualification:p13` and record the real external result.

A fresh built-client asset audit found no raw signaling capability, Clerk secret, TURN shared secret,
database URL, or provider bearer token. The Clerk runtime's `CLERK_SECRET_KEY` environment-variable
identifier is present as framework code, but no secret value is present in the client assets. A
Wrangler dry-run is not deployment evidence and a preview URL cannot substitute for the persistent
gate.

## Status

`P13 REPOSITORY IMPLEMENTATION: PASS` and `P13 EXTERNAL QUALIFICATION: BLOCKED` are the authoritative
statuses. P13 is not frozen, and P15+ scope was not started.
