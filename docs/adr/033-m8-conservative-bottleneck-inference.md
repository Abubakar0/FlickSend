# ADR 033: Require Corroborating Signals For Bottleneck Labels

## Decision

Infer a source, destination, network, relay, or generic backpressure limit only after warmup and
three consistent samples. Require multiple independent signals such as local rate headroom and a
bounded queue condition. Emit reasons, confidence, and `INSUFFICIENT_DATA` when signals disagree.

## Consequences

The UI explains evidence rather than promising causal certainty. Browser bitrate is treated as an
estimate. Recovery, pause, and stall suppress bottleneck claims so transient state is not mislabeled
as a performance limit.
