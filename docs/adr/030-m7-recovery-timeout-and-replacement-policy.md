# ADR 030: Bound ICE Restart and Prefer Deterministic PeerConnection Replacement

## Status

Accepted

## Context

ICE restart can repair a viable PeerConnection without recreating DataChannels, but it does not
reliably recover every browser failure mode. M4/M6 recovery already prove full replacement and FSTP
reconciliation.

## Decision

Manual `restartIce()` is supported and times out after 8 seconds. Route loss waits a 2-second
disconnected grace period, then uses offerer-driven full replacement as the deterministic default.
Each replacement has a 15-second connection timeout, at most two replacement attempts, and a
500-millisecond increasing backoff. Replacement fetches a fresh ICE configuration and attaches the
same transfer to the new transport.

## Consequences

Short disconnects do not immediately destroy a route, and permanent failure cannot loop forever.
The UI never owns timers. Route exhaustion is explicit while receiver-verified recovery state remains
available. These settings are reliability defaults, not performance claims.
