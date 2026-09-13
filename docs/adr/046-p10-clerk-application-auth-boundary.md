# ADR 046: Clerk Behind An Application Auth Boundary

## Status

Accepted. Live Clerk development qualification passed on September 14, 2026 using a temporary test user with
verified cleanup. P10 is complete and frozen; P11 remains not authorized pending external review.

## Context

FlickSend needs an ordinary account/session model for sender-side product routes without making authentication a
transfer authority or prematurely creating a production account database. Engine packages cannot depend on React,
Next.js, authentication, or persistence infrastructure.

## Decision

Use Clerk's official Next.js integration behind `apps/engine-lab/app/auth`. The boundary exports a
provider-independent `AuthPrincipal`, optional and required server resolution helpers, safe return-path handling,
and a presentation-only current-account context. Clerk-specific imports are constrained to this adapter and its
account/sign-in presentation components.

Account-owned pages resolve authentication on the server. Guest Receive remains separate: P5 session
authorization, not account authentication, controls recipient access. Clerk provider subject IDs are internal to
the adapter and are never product URLs, People data, transfer metadata, support references, or UI identity.

Synthetic P6 identities are available only through an explicit non-production Engine Lab qualification switch.
They are not a production sign-in scheme and production ignores `?as=` selection.

## Consequences

- Clerk owns sessions, provider verification, callback state, and token/cookie handling; FlickSend does not create
  password, OTP, OAuth, or session protocols.
- P10 supplies no production database mapping. A Clerk subject is not yet a FlickSend persistent account row;
  mapping and product persistence are deferred to P11.
- Product sign-out has no authority over engine transfer identity, integrity, recovery, or delivery. Existing live
  transfer navigation warnings remain the only supported page-lifetime protection.
- P11 will need a deliberate durable-account mapping decision rather than reusing fixture or display data.
