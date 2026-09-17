# ADR 052: Permit Capability Sessions to Use an ICE Provider

## Status

Accepted.

## Context

The pre-P14 ICE provider request required a legacy six-digit session code. P12 authorized signaling
uses a signed capability instead and intentionally has no legacy code. Rejecting every provider in
that state prevented a prepared P14 ICE configuration from reaching WebRTC.

## Decision

Make the request's legacy session code optional. `ConnectionCoordinator` invokes an injected provider
when either existing session transport authority is present: a legacy session code or an authorized
signaling capability. The legacy HTTP provider rejects an absent session code before it makes a
request. The P14 application adapter ignores peer and legacy-code fields and sends only the capability
to its own protected route.

## Consequences

This is an interface compatibility correction, not a transfer or authorization redesign. No capability,
Railway behavior, authentication, or UI correctness logic enters `engine-core`; transfer identity,
FSTP recovery, integrity, and payload routing remain unchanged.
