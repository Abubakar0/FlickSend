# ADR 032: Use Bounded 500 Millisecond Health Sampling

## Decision

Sample safe transport diagnostics at 500 ms and retain at most 120 samples, 64 events, and 16 route
segments. Publish raw transfer progress to the UI only at the existing bounded snapshot cadence.

## Consequences

Health memory remains constant for long transfers and React does not render at frame frequency.
The selected cadence is observability-oriented, not a performance optimization or rate-control loop.
The sampler is tied to the active transport and route generation and is stopped on cancellation,
disconnect, or route loss.
