# ADR-036: Separate Browser Feature Detection From Qualification Evidence

## Status

Accepted for M9.

## Decision

`@flicksend/browser-capabilities` owns typed, permission-free browser feature probes and typed reason
codes. It has no dependency on the transfer engine. Browser identity parsed from a user agent is used
only to label qualification evidence with browser and operating-system context; it must not enable,
disable, or rank transfer behavior.

Feature detection returns `UNKNOWN` where live transfer behavior is required. A snapshot cannot grant
`FULL_SUPPORT`; only a dated real-environment qualification matrix may do so.

## Consequences

Engine Lab can explain an unavailable directory or streaming destination without browser-name
blocking. `engine-core` remains browser-agnostic, and dynamic telemetry remains non-fatal.
