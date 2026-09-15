# ADR 049: Signed Capability Signaling With Hibernating Durable Objects

## Status

Accepted for P12.

## Context

Authenticated accounts and connected People relationships must not permit arbitrary signaling-session joins. The application needs production-capable live WebSocket coordination without coupling WebRTC payload or PostgreSQL to Cloudflare Durable Objects.

## Decision

The application server mints short-lived HMAC-signed, sender/receiver role capabilities after server-side People eligibility checks. Cloudflare verifies a capability before routing to a Durable Object keyed by an opaque signaling session ID. The Durable Object hibernates at most two sockets and retains only role, expiry, and short-lived revocation state. Raw capabilities terminate at the Worker verification boundary and are not passed to the Durable Object.

## Consequences

Signaling reconnect can reuse its capability/session context while leaving the FSTP transfer identity unchanged. Cloudflare never needs PostgreSQL access and never relays payload. Capability leakage is bounded by expiry/revocation but remains a bearer-risk requiring private link handling. Production TURN deployment, persistent session history, and application-layer encryption remain deferred.
