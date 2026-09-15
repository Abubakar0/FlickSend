# P13/P14 Production Infrastructure Design

## Status

Approved design for implementation planning. This document authorizes no P15+ work.

## Purpose

P13 operationalizes the P12 signaling Worker and Durable Object as a reproducible, environment-separated Cloudflare service. P14 operationalizes M7 TURN fallback as a public coturn deployment with server-authorized, short-lived credentials. Both retain existing FSTP, integrity, StreamPack, recovery, delivery, and transfer-identity behavior.

The Railway staging application origin is:

```text
https://flicksendengine-lab-staging.up.railway.app
```

It remains the application/API and PostgreSQL staging plane. Cloudflare is the signaling control plane. A dedicated public VM/VPS is the TURN data-relay plane. Railway is not assumed to support coturn UDP or a relay port range.

## Scope And Completion Boundaries

### P13 - Production Signaling Deployment & Operations

P13 delivers a typed shared environment contract; development, staging, and production Wrangler definitions; isolated Durable Object bindings; provider-secret declarations; origin and request controls; a non-enumerating health endpoint; bounded operational behavior; deployment and rollback procedures; deterministic local tests; and a persistent Cloudflare staging qualification command.

P13 does not change FSTP, WebRTC transport semantics, invitation or People authority, transfer identity, delivery state, database schema, payload routing, or P14 TURN credential issuance.

### P14 - Production TURN & Relay Infrastructure

P14 delivers a Railway server-side relay credential issuer; bounded client-safe ICE configuration; credential renewal policy; direct-first route integration; coturn Docker/firewall/secrets templates; deterministic local qualification; and a public-host qualification command.

P14 does not move TURN credentials into Cloudflare, browser configuration, PostgreSQL, product history, or logs. It does not change FSTP, logical block state, verified recovery, StreamPack, `DELIVERED`, or transfer identity.

### External Evidence

P13 final PASS requires a persistent Cloudflare staging Worker and Durable Object. P14 final PASS requires publicly reachable coturn infrastructure. Neither exists or is credentialed in the current environment. Implementation may complete while each final external qualification remains explicitly `BLOCKED`; no report may call it PASS without the required real evidence.

## Shared Environment Contract

One server-owned contract defines `development`, `staging`, and `production`.

| Value | Visibility | Owner | Rules |
| --- | --- | --- | --- |
| Environment class | server and Worker | deployment configuration | Must be one of the three exact values. |
| Signaling Worker URL | browser-safe | Railway environment | Must be a credential-free `wss:` URL. |
| Expected browser origins | Worker-only configuration | Cloudflare environment | Exact HTTPS origins; no wildcard production origin. |
| Signaling capability secret | server-only and Worker secret | Railway and Cloudflare | Independent random value per environment; never configured as a public variable. |
| TURN URLs | Railway server configuration | Railway | Parsed and returned only as a bounded ICE DTO. |
| TURN shared secret | Railway and coturn host secret | Railway and VPS | Independent from signaling secret; never sent to Cloudflare or browser source. |
| TURN credential TTL | Railway server configuration | Railway | Integer bounded to 10-60 minutes; default 30 minutes. |

Each Cloudflare named environment has explicit non-inherited Durable Object bindings, environment class, and required secret declarations. Staging and production use different Worker names and different Durable Object namespaces. Configuration absence or mismatch produces a safe unavailable category rather than a fallback to another environment.

## P13 Architecture

### Worker Boundary

The existing `fsst1` capability remains the authority for admission. The Worker verifies it, removes raw credentials before Durable Object routing, and forwards only role and expiry. Durable Objects retain at most two hibernating sockets plus bounded expiry/revocation state. They never receive payload, files, paths, manifests, FSTP frames, database credentials, or TURN credentials.

The Worker gains:

- `GET /health`, returning only reachability, non-sensitive build/version, and safe environment class;
- expected-origin validation for browser-originated HTTP and WebSocket requests, while capability verification remains authoritative;
- method/path rejection, safe generic errors, and bounded admission/message-frequency protection;
- environment configuration validation that fails closed;
- a server-to-server relay-eligibility operation. It verifies a signaling capability and asks the existing room only whether that capability is unexpired and not revoked. It returns a boolean-safe category, never a TURN credential or room/session metadata.

The room retains same-role replacement, short expiry, revocation, maximum two peers, schema/message limits, and hibernation. Health checks do not create a room.

### P13 Operations

Wrangler deployment configuration remains in `apps/signaling`. Documentation defines provider-secret setup, environment separation, Durable Object migrations, deployment, rollback, version compatibility, safe log categories, and the limitation that rollback is not proven until exercised.

The Railway staging application uses its staging Worker URL through the existing browser-safe environment variable. No temporary preview URL is committed or used as a production claim.

## P14 Architecture

### Credential Issuance

The current six-digit-session `/turn-credentials` Worker endpoint is M7 development-only and cannot be the P14 production path. P14 introduces a Railway server route behind a narrow application adapter:

1. The sender or guest receiver presents only the bounded P12 signaling capability context appropriate to its role.
2. Railway validates capability syntax/signature without logging or persisting it.
3. Railway asks the Worker relay-eligibility operation to confirm expiry/revocation/room state.
4. Railway applies a bounded issuance rate and creates a coturn REST credential from `TURN_SHARED_SECRET`.
5. Railway returns a bounded browser-safe ICE DTO: public STUN/TURN URLs, ephemeral username, ephemeral password, and expiry. It never returns the shared secret, internal infrastructure address, capability claim, or account identifier.

The default credential TTL is 30 minutes, within the existing 10-60 minute bound. An active, still-authorized participant may request replacement credentials before expiry through the same checks. Renewal does not create a FSTP transfer, session, logical block, or route identity. Rejected, expired, revoked, malformed, or rate-limited requests receive a safe category only.

### Transport Integration

The existing route layer remains direct-first. It consumes the prepared ICE DTO only when fallback/relay is required. Route changes, signaling rejoin, ICE restart, credential renewal, and relay failure preserve existing transfer identity and receiver-authoritative verified recovery. The engine does not import application, infrastructure, authentication, or coturn code.

### Coturn Deployment

P14 evolves the existing local compose setup into sanitized production templates rather than inventing a new infrastructure framework. The selected public host must expose `3478` over UDP/TCP and the bounded relay range `49160-49200` over UDP/TCP. SSH/admin access is restricted; the coturn CLI is disabled; anonymous access is prohibited; REST/shared-secret authentication is enabled; public/NAT address mapping is explicit; and log verbosity is minimal.

`turns:`/TLS is not claimed until a valid certificate and permitted hostname are deployed and separately qualified. A custom FlickSend domain is not acquired for P14.

## Data, Privacy, And Security Boundaries

P13/P14 add no database table or migration. They never persist raw signaling capabilities, TURN credentials, shared secrets, SDP, ICE candidates, IP addresses, allocations, payload, filenames, paths, manifests, engine IDs, transfer IDs, or provider subjects.

Product logs and UI contain no infrastructure secrets, capability values, network addresses, Cloudflare/Durable Object/coturn internals, raw infrastructure errors, or credential data. Only safe categories reach the product surface, such as a temporary connection-service unavailability.

Direct transfers are never pricing-throttled. Coturn allocation/issuance limits exist only to prevent infrastructure abuse and are not billing or product-tier controls.

## Testing And Qualification

### Deterministic Repository Tests

P13 tests cover environment validation, origins, health safety, method/path rejection, capability tampering/expiry/revocation, message/admission bounds, reconnect/replacement, and safe unavailable mapping.

P14 tests cover Railway server authority, sender and guest receiver authorization, malformed/expired/revoked contexts, credential TTL and renewal, rate bounds, client-safe ICE DTO validation, no secret exposure, direct preference, relay fallback, and safe relay unavailability.

New commands are `pnpm qualification:p13`, `pnpm qualification:p14`, and `pnpm qualification:p13-p14`. In an environment without external provider access, they must execute local deterministic cases and report the external stage as `BLOCKED`, never PASS.

### External Gates

P13 external qualification uses Railway staging, a persistent Cloudflare staging Worker/DO, and real WebSocket clients. P14 uses a public coturn host and real external clients. The combined gate verifies direct and forced-relay negotiation, stable FSTP identity, receiver-authoritative recovery, authorization rejection, no application/Worker payload relay, secret absence, and engine `DELIVERED` completion semantics.

M4-M10 dedicated qualification is not rerun unless implementation changes engine correctness code. The intended design avoids such changes.

## Documentation And Decision Records

Implementation creates the required P13, P14, and combined integration reports, deployment/security/operations documents, and material ADRs. All reports separate repository implementation results from external evidence and retain no secrets or private-network values.

## Delivery Sequence

1. Update phase authority and add shared configuration contracts.
2. Implement and test P13 Worker environment/operational behavior.
3. Implement and test P14 Railway credential issuance and prepared ICE integration.
4. Add sanitized coturn and deployment artifacts.
5. Add separate and combined qualification runners plus reports.
6. Run repository verification and local deterministic qualification.
7. Record external Cloudflare and public coturn qualification as blocked until accounts/hosts are supplied.

P15 and all later phases remain unauthorized throughout.
