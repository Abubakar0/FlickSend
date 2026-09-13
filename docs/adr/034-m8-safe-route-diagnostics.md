# ADR 034: Sample Only Sanitized Selected-Pair Diagnostics

## Decision

Transfer Health consumes only route class/detail, protocol class, selected-pair state, RTT,
browser-provided bitrate estimate, and aggregate WebRTC byte counters from `transport-webrtc`.

## Consequences

Diagnostics can segment a transfer across direct and relay routes without retaining candidate SDP,
addresses, credentials, payload, filenames, or paths. A failed `getStats()` read is recorded as an
unavailable observation and cannot fail a transfer.
