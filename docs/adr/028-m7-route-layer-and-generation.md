# ADR 028: Keep Route Selection Outside FSTP

## Status

Accepted

## Context

Direct and relay ICE paths can change during one transfer. Folding a candidate route into FSTP
would make integrity and folder protocols transport-specific and risk assigning a new transfer to a
new PeerConnection.

## Decision

`transport-webrtc` exposes only safe selected-pair route diagnostics. `engine-core` owns monotonic
route generations, bounded direct/relay attempts, and stale callback rejection. FSTP v4/v5 receive
a replacement `TransferTransport` and retain existing transfer ID, manifest identity, and verified
recovery state. The default is direct-first; relay-only is a qualification policy.

## Consequences

Route errors fail explicitly after a bounded recovery policy. FSTP versioning is unchanged for M7.
Every route recovery change requires direct/relay interruption tests and verification that committed
verified blocks are not resent.
